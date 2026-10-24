import type { StateStorage } from "zustand/middleware";

/** The synchronous local copy is authoritative; the native file is an ordered recovery mirror. */
export function createSettingsStorage(native: () => boolean): StateStorage {
  let writes: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => { const operation = writes.catch(() => undefined).then(work); writes = operation.catch(() => undefined); return operation; };
  return {
    getItem: async (name) => {
      const local = localStorage.getItem(name); if (local !== null) return local;
      if (native()) try {
        const { readTextFile, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        if (await exists(`${name}.json`, { baseDir: BaseDirectory.AppConfig })) {
          const value = await readTextFile(`${name}.json`, { baseDir: BaseDirectory.AppConfig });
          localStorage.setItem(name, value); return value;
        }
      } catch (error) { console.warn("Native settings recovery copy could not be read.", error); }
      return null;
    },
    setItem: async (name, value) => {
      localStorage.setItem(name, value);
      if (native()) await enqueue(async () => {
        const { writeTextFile, mkdir, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        if (!await exists("", { baseDir: BaseDirectory.AppConfig })) await mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true });
        await writeTextFile(`${name}.json`, value, { baseDir: BaseDirectory.AppConfig });
      }).catch((error) => console.warn("Settings are retained locally; the native recovery copy could not be updated.", error));
    },
    removeItem: async (name) => {
      // A tombstone prevents a failed native removal from restoring old settings.
      if (!native()) { localStorage.removeItem(name); return; }
      localStorage.setItem(name, "null");
      await enqueue(async () => {
        const { remove, exists, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        if (await exists(`${name}.json`, { baseDir: BaseDirectory.AppConfig })) await remove(`${name}.json`, { baseDir: BaseDirectory.AppConfig });
      });
    },
  };
}
