import { isTauri } from "../../stores/useSettingsStore";
import { normalizeCacheServerUrl } from "./offlineCache";

export const MAX_LIBRARY_BACKUP_BYTES = 512 * 1024 * 1024;
export const BACKUPS_CHANGED_EVENT = "yomikura-library-backups-changed";
const DB_NAME = "yomikura-library-backups";
const STORE = "backups";
const NATIVE_FOLDER = "library-backups";

export type BackupPurpose = "manual" | "scheduled" | "safety";
export type LibraryBackup = {
  id: string;
  serverBaseUrl: string;
  fileName: string;
  purpose: BackupPurpose;
  createdAt: number;
  size: number;
  sha256: string | null;
  storage: "browser" | "native";
};
type BrowserBackup = LibraryBackup & { blob: Blob; verified: boolean };

export class LibraryBackupError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "LibraryBackupError";
    this.cause = options?.cause;
  }
}

export async function verifyLibraryBackupArchive(bytes: Uint8Array) {
  validateLibraryBackupBytes(bytes);
  try {
    const reader = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    let expandedSize = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        expandedSize += value.length;
        if (expandedSize > MAX_LIBRARY_BACKUP_BYTES * 4) {
          await reader.cancel();
          throw new Error("Expanded backup exceeds its safety limit.");
        }
      }
      if (!expandedSize) throw new Error("Empty backup archive.");
    } finally { reader.releaseLock(); }
  } catch (error) {
    throw new LibraryBackupError("The backup archive is incomplete or could not be validated. No safety copy was confirmed.", { cause: error });
  }
}

export function backupErrorMessage(error: unknown, fallback = "The backup operation could not be completed.") {
  return error instanceof LibraryBackupError ? error.message : fallback;
}

export function validateLibraryBackupBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_LIBRARY_BACKUP_BYTES) {
    throw new LibraryBackupError("The backup is empty or exceeds the 512 MB safety limit.");
  }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new LibraryBackupError("Suwayomi did not return a valid gzip backup file.");
  }
}

async function checksum(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function verifyWrittenBytes(expected: Uint8Array, actual: Uint8Array) {
  if (expected.length !== actual.length || expected.some((byte, index) => actual[index] !== byte)) {
    throw new LibraryBackupError("The saved backup did not match the exported file. No safety backup was confirmed.");
  }
}

function validateRecord(value: unknown): LibraryBackup {
  const record = value as LibraryBackup | null;
  if (!record || !/^backup-[a-z0-9-]+$/.test(record.id) || typeof record.serverBaseUrl !== "string"
    || typeof record.fileName !== "string" || !["manual", "scheduled", "safety"].includes(record.purpose)
    || !Number.isFinite(record.createdAt) || record.createdAt <= 0 || !Number.isFinite(record.size)
    || record.size <= 0 || record.size > MAX_LIBRARY_BACKUP_BYTES
    || !["browser", "native"].includes(record.storage)
    || (record.sha256 !== null && !/^[a-f0-9]{64}$/.test(record.sha256))) {
    throw new LibraryBackupError("Saved backup information could not be read.");
  }
  return record;
}

function metadata(record: LibraryBackup): LibraryBackup {
  return {
    id: record.id, serverBaseUrl: record.serverBaseUrl, fileName: record.fileName,
    purpose: record.purpose, createdAt: record.createdAt, size: record.size,
    sha256: record.sha256, storage: record.storage,
  };
}

function changed(serverBaseUrl: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BACKUPS_CHANGED_EVENT, { detail: serverBaseUrl }));
  }
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("serverBaseUrl", "serverBaseUrl");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new LibraryBackupError("Close other Yomikura tabs so backup storage can open."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function databaseRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    try {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error ?? request.error); };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

async function nativeFS() {
  const fs = await import("@tauri-apps/plugin-fs");
  return { fs, options: { baseDir: fs.BaseDirectory.AppLocalData } };
}

export async function saveLibraryBackup(serverBaseUrl: string, bytes: Uint8Array, purpose: BackupPurpose): Promise<LibraryBackup> {
  await verifyLibraryBackupArchive(bytes);
  const server = normalizeCacheServerUrl(serverBaseUrl);
  if (!server) throw new LibraryBackupError("Choose a server before saving a backup.");
  const createdAt = Date.now();
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${createdAt.toString(36)}-${Math.random().toString(36).slice(2)}`;
  const id = `backup-${suffix}`;
  const record: LibraryBackup = {
    id, serverBaseUrl: server, purpose, createdAt, size: bytes.length,
    fileName: `yomikura-${purpose}-${new Date(createdAt).toISOString().replace(/[:.]/g, "-")}-${suffix.slice(-8)}.tachibk`,
    sha256: await checksum(bytes), storage: isTauri() ? "native" : "browser",
  };
  try {
    if (record.storage === "native") {
      const { fs, options } = await nativeFS();
      await fs.mkdir(NATIVE_FOLDER, { ...options, recursive: true });
      const file = `${NATIVE_FOLDER}/${id}.tachibk`;
      const manifest = `${NATIVE_FOLDER}/${id}.json`;
      if (await fs.exists(file, options) || await fs.exists(manifest, options)) {
        throw new LibraryBackupError("A backup with this identity already exists. Retry to create a new copy.");
      }
      await fs.writeFile(`${file}.part`, bytes, options);
      verifyWrittenBytes(bytes, await fs.readFile(`${file}.part`, options));
      const renameOptions = { oldPathBaseDir: options.baseDir, newPathBaseDir: options.baseDir };
      await fs.rename(`${file}.part`, file, renameOptions);
      const manifestBytes = new TextEncoder().encode(JSON.stringify(record));
      await fs.writeFile(`${manifest}.part`, manifestBytes, options);
      verifyWrittenBytes(manifestBytes, await fs.readFile(`${manifest}.part`, options));
      await fs.rename(`${manifest}.part`, manifest, renameOptions);
    } else {
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/gzip" });
      await databaseRequest("readwrite", (store) => store.add({ ...record, blob, verified: false } satisfies BrowserBackup));
      try {
        const saved = await databaseRequest<BrowserBackup>("readonly", (store) => store.get(id));
        verifyWrittenBytes(bytes, new Uint8Array(await saved.blob.arrayBuffer()));
        await databaseRequest("readwrite", (store) => store.put({ ...record, blob: saved.blob, verified: true } satisfies BrowserBackup));
      } catch (error) {
        // Remove only this operation's uncommitted candidate, never an existing recovery copy.
        await databaseRequest("readwrite", (store) => store.delete(id)).catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof LibraryBackupError) throw error;
    throw new LibraryBackupError("The backup could not be saved on this device. Check free space and storage permissions, then retry.", { cause: error });
  }
  changed(server);
  return record;
}

export async function listLibraryBackups(serverBaseUrl: string): Promise<LibraryBackup[]> {
  const server = normalizeCacheServerUrl(serverBaseUrl);
  if (!server) return [];
  try {
    let records: LibraryBackup[];
    if (isTauri()) {
      const { fs, options } = await nativeFS();
      if (!(await fs.exists(NATIVE_FOLDER, options))) return [];
      records = [];
      for (const entry of await fs.readDir(NATIVE_FOLDER, options)) {
        if (!entry.isFile || entry.isSymlink || !/^backup-[a-z0-9-]+\.json$/.test(entry.name)) continue;
        const record = validateRecord(JSON.parse(await fs.readTextFile(`${NATIVE_FOLDER}/${entry.name}`, options)));
        if (record.storage === "native" && entry.name === `${record.id}.json` && record.serverBaseUrl === server) records.push(metadata(record));
      }
    } else {
      const stored = await databaseRequest<BrowserBackup[]>("readonly", (store) => store.index("serverBaseUrl").getAll(server));
      records = stored.filter((record) => record.verified === true).map((record) => metadata(validateRecord(record)));
    }
    return records.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    throw new LibraryBackupError("Saved backups could not be listed. Device storage may be unavailable.", { cause: error });
  }
}

export async function readLibraryBackup(serverBaseUrl: string, id: string): Promise<{ backup: LibraryBackup; bytes: Uint8Array }> {
  if (!/^backup-[a-z0-9-]+$/.test(id)) throw new LibraryBackupError("Invalid saved backup identity.");
  try {
    let backup: LibraryBackup;
    let bytes: Uint8Array;
    if (isTauri()) {
      const { fs, options } = await nativeFS();
      backup = validateRecord(JSON.parse(await fs.readTextFile(`${NATIVE_FOLDER}/${id}.json`, options)));
      bytes = await fs.readFile(`${NATIVE_FOLDER}/${id}.tachibk`, options);
    } else {
      const record = await databaseRequest<BrowserBackup | undefined>("readonly", (store) => store.get(id));
      if (!record?.verified) throw new LibraryBackupError("This backup has not completed its saved-file verification.");
      backup = validateRecord(record);
      bytes = new Uint8Array(await record.blob.arrayBuffer());
    }
    if (backup.id !== id || backup.serverBaseUrl !== normalizeCacheServerUrl(serverBaseUrl)) {
      throw new LibraryBackupError("This saved backup belongs to another server.");
    }
    await verifyLibraryBackupArchive(bytes);
    if (bytes.length !== backup.size || (backup.sha256 !== null && await checksum(bytes) !== backup.sha256)) {
      throw new LibraryBackupError("The saved backup failed its integrity check. Choose another recovery copy.");
    }
    return { backup: metadata(backup), bytes };
  } catch (error) {
    if (error instanceof LibraryBackupError) throw error;
    throw new LibraryBackupError("The saved backup could not be read. Choose another recovery copy.", { cause: error });
  }
}

export async function removeLibraryBackup(serverBaseUrl: string, id: string) {
  // Validate the namespace and artifact before allowing removal through the confirmed UI action.
  const { backup } = await readLibraryBackup(serverBaseUrl, id);
  try {
    if (isTauri()) {
      const { fs, options } = await nativeFS();
      await fs.remove(`${NATIVE_FOLDER}/${id}.tachibk`, options);
      await fs.remove(`${NATIVE_FOLDER}/${id}.json`, options);
    } else {
      await databaseRequest("readwrite", (store) => store.delete(id));
    }
  } catch (error) {
    throw new LibraryBackupError("The saved backup could not be removed. Check device storage and retry.", { cause: error });
  }
  changed(backup.serverBaseUrl);
}

export async function openLibraryBackupFolder() {
  const [{ appLocalDataDir, join }, { invoke }] = await Promise.all([
    import("@tauri-apps/api/path"), import("@tauri-apps/api/core"),
  ]);
  await invoke("open_logs_folder", { dataPath: await join(await appLocalDataDir(), NATIVE_FOLDER) });
}
