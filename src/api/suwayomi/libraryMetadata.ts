import { rememberedLibrary } from "./librarySession";
import { normalizeCacheServerUrl } from "./offlineCache";
import { pendingLibraryRestore } from "./restoreIdentity";

// Metadata is independent of downloaded page bytes. A listing never grants
// permission to open an unsaved chapter, replay a mutation or trust another DB.
const DB = "yomikura-library-metadata-v1";
const offlineValues = new WeakSet<object>();
export function markMetadataSnapshot<T extends object>(value: T): T { offlineValues.add(value); return value; }
export function isMetadataSnapshot(value: unknown) { return !!value && typeof value === "object" && offlineValues.has(value); }
export function metadataScope(server: string, marker = rememberedLibrary(server)?.marker) {
  return marker && !pendingLibraryRestore(server) ? JSON.stringify([normalizeCacheServerUrl(server), marker]) : undefined;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("snapshots", { keyPath: "key" }); open.result.createObjectStore("covers", { keyPath: "key" }); };
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
}
async function read<T>(store: string, key: string): Promise<T | undefined> {
  const db = await database();
  try { return await new Promise<T | undefined>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result?.value); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
async function write(store: string, key: string, value: unknown) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put({ key, value, savedAt: Date.now() });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function readMetadata<T>(scope: string | undefined, key: string) {
  if (!scope || typeof indexedDB === "undefined") return undefined;
  return read<T>("snapshots", JSON.stringify([scope, key]));
}
export async function saveMetadata(scope: string | undefined, key: string, value: unknown) {
  if (scope && typeof indexedDB !== "undefined") await write("snapshots", JSON.stringify([scope, key]), value);
}
export async function hasLibraryMetadata(server: string) {
  try { return !!await readMetadata(metadataScope(server), "library"); } catch { return false; }
}
export async function readCover(scope: string | undefined, url: string) {
  if (!scope || typeof indexedDB === "undefined") return undefined;
  try { return await read<Blob>("covers", JSON.stringify([scope, url])); } catch { return undefined; }
}
export async function saveCover(scope: string | undefined, url: string, blob: Blob) {
  if (!scope || typeof indexedDB === "undefined" || !blob.type.startsWith("image/") || blob.size > 2 * 1024 * 1024) return;
  try { await write("covers", JSON.stringify([scope, url]), blob); } catch { /* Reading remains usable if storage is full. */ }
}

/** Network first while connected; only transport outages may use a snapshot. */
export async function metadataRead<T extends object>(scope: string | undefined, key: string, fetchValue: () => Promise<T>, options: { preferSaved?: boolean; signal?: AbortSignal | null } = {}): Promise<T> {
  options.signal?.throwIfAborted();
  const saved = async () => { try { const value = await readMetadata<T>(scope, key); return value && markMetadataSnapshot(value); } catch { return undefined; } };
  if (options.preferSaved) { const value = await saved(); options.signal?.throwIfAborted(); if (value) return value; }
  try {
    const value = await fetchValue();
    options.signal?.throwIfAborted();
    try { await saveMetadata(scope, key, value); } catch { /* Never replace a live result with a cache-write error. */ }
    options.signal?.throwIfAborted(); return value;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    const outage = status !== undefined ? status >= 500 : error instanceof TypeError || /^(TimeoutError|NetworkError|AbortError)$/.test((error as Error)?.name);
    if (!options.signal?.aborted && outage) { const value = await saved(); options.signal?.throwIfAborted(); if (value) return value; }
    throw error;
  }
}
