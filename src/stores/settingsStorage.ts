import type { StateStorage } from "zustand/middleware";

function isSettingsSnapshot(value: string): boolean {
  try {
    const snapshot = JSON.parse(value);
    return !!snapshot?.state && typeof snapshot.state === "object" && !Array.isArray(snapshot.state)
      && (snapshot.version === undefined || Number.isSafeInteger(snapshot.version) && snapshot.version >= 0)
      && (snapshot.state.serverBaseUrl == null || typeof snapshot.state.serverBaseUrl === "string")
      && (snapshot.state.profiles == null || Array.isArray(snapshot.state.profiles));
  } catch {
    return false;
  }
}

/** The synchronous local copy is authoritative; the native file is an ordered recovery mirror. */
export function createSettingsStorage(native: () => boolean): StateStorage {
  let writes: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => { const operation = writes.catch(() => undefined).then(work); writes = operation.catch(() => undefined); return operation; };
  return {
    getItem: async (name) => {
      const local = localStorage.getItem(name)?.replace(/^\uFEFF/, "") ?? null;
      if (local === "null" || local !== null && isSettingsSnapshot(local)) return local;
      if (native()) try {
        const { readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        if (await exists(`${name}.json`, { baseDir: BaseDirectory.AppConfig })) {
          const value = (await readTextFile(`${name}.json`, { baseDir: BaseDirectory.AppConfig })).replace(/^\uFEFF/, "");
          const current = localStorage.getItem(name)?.replace(/^\uFEFF/, "") ?? null;
          if (current === "null" || current !== null && isSettingsSnapshot(current)) return current;
          if (isSettingsSnapshot(value)) {
            localStorage.setItem(name, value);
            return value;
          }
        }
      } catch (error) { console.warn("Native settings recovery copy could not be read.", error); }
      return null;
    },
    setItem: async (name, value) => {
      localStorage.setItem(name, value);
      if (native()) await enqueue(async () => {
        const { writeTextFile, readTextFile, rename, mkdir, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const baseDir = BaseDirectory.AppConfig;
        if (!await exists("", { baseDir })) await mkdir("", { baseDir, recursive: true });
        const staged = `${name}.json.pending`;
        await writeTextFile(staged, value, { baseDir });
        if (await readTextFile(staged, { baseDir }) !== value) throw new Error("The staged settings could not be verified.");
        await rename(staged, `${name}.json`, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
      }).catch((error) => console.warn("Settings are retained locally; the native recovery copy could not be updated.", error));
    },
    removeItem: async (name) => {
      // A tombstone prevents a failed native removal from restoring old settings.
      if (!native()) { localStorage.removeItem(name); return; }
      localStorage.setItem(name, "null");
      await enqueue(async () => {
        const { remove, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        const options = { baseDir: BaseDirectory.AppConfig };
        for (const file of [`${name}.json.pending`, `${name}.json`]) {
          if (await exists(file, options)) await remove(file, options);
        }
      });
    },
  };
}
