import type { ChapterProgressIdentity, ProgressBackend } from "./backendIdentity";
export interface CleanupJob { key: string; backend: ProgressBackend; chapter: ChapterProgressIdentity; epoch: number; sequence: number; completedAt: number; kind: "automatic" | "manual" }
export const CLEANUP_CHANGED = "yomikura-download-cleanup-changed";
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open("yomikura-download-cleanup", 1); open.onupgradeneeded = () => { const store = open.result.createObjectStore("jobs", { keyPath: "key" }); store.createIndex("backend", "backend.key"); }; open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  db.onversionchange = () => db.close(); const tx = db.transaction("jobs", mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Cleanup storage is unavailable")); });
  try { const result = await work(tx.objectStore("jobs")); await done; return result; } catch (error) { try { tx.abort(); } catch { /* Settled. */ } await done.catch(() => undefined); throw error; } finally { db.close(); }
}
export const cleanupJobKey = (backend: ProgressBackend, id: number) => JSON.stringify([backend.key, id]);
export const saveCleanupJob = (job: CleanupJob) => transaction("readwrite", async (store) => {
  const current = await request<CleanupJob | undefined>(store.get(job.key));
  if (!current || job.epoch > current.epoch || job.epoch === current.epoch && job.sequence > current.sequence) await request(store.put(job));
});
export const getCleanupJobs = (backend: ProgressBackend) => transaction("readonly", (store) => request<CleanupJob[]>(store.index("backend").getAll(backend.key)));
export const isCurrentCleanupJob = (job: CleanupJob) => transaction("readonly", async (store) => { const current = await request<CleanupJob | undefined>(store.get(job.key)); return current?.sequence === job.sequence && current.epoch === job.epoch; });
export const removeCleanupJob = (job: CleanupJob) => transaction("readwrite", async (store) => { const current = await request<CleanupJob | undefined>(store.get(job.key)); if (current?.sequence === job.sequence && current.epoch === job.epoch) await request(store.delete(job.key)); });
export async function cancelCleanupJobs(kind?: CleanupJob["kind"]) { await transaction("readwrite", async (store) => { for (const job of await request<CleanupJob[]>(store.getAll())) if (!kind || job.kind === kind) await request(store.delete(job.key)); }); if (typeof window !== "undefined") window.dispatchEvent(new Event(CLEANUP_CHANGED)); }
