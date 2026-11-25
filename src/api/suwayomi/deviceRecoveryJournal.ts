import type { RecoveryPreferences } from "../../stores/recoveryPreferences";

export type RecoveryJob = {
  id: string;
  file: Blob;
  target?: string;
  rebuiltLibraryId?: string;
  previousPreferences?: RecoveryPreferences;
  preferencesApplied?: boolean;
  deviceRecordsRestored?: boolean;
  reviewedProgress?: number[];
};

function request<T>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>) {
  const open = indexedDB.open("yomikura-device-recovery", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("staged");
  const db = await request(open);
  db.onversionchange = () => db.close();
  const tx = db.transaction("staged", mode, { durability: "strict" });
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Recovery storage could not save this change."));
  });
  try {
    const result = await work(tx.objectStore("staged"));
    await done;
    return result;
  } catch (error) {
    try { tx.abort(); } catch { /* An aborted transaction needs no further work. */ }
    await done.catch(() => undefined);
    throw error;
  } finally { db.close(); }
}

export function readRecoveryJob() {
  return transact("readonly", (store) => request<RecoveryJob | undefined>(store.get("current")));
}

export function stageRecoveryJob(file: Blob) {
  return transact("readwrite", async (store) => {
    if (await request(store.getKey("current"))) throw new Error("Finish or remove the staged recovery file before opening another one.");
    const job: RecoveryJob = { id: crypto.randomUUID(), file };
    await request(store.add(job, "current"));
    return job;
  });
}

export function checkpointRecovery(id: string, update: (current: RecoveryJob) => RecoveryJob | undefined) {
  return transact("readwrite", async (store) => {
    const current = await request<RecoveryJob | undefined>(store.get("current"));
    if (!current || current.id !== id) throw new Error("The staged recovery file changed. Reopen Backups to continue.");
    const next = update(current);
    if (next) await request(store.put(next, "current"));
    else await request(store.delete("current"));
    return next;
  });
}

let recoveryRunning = false;
export async function runRecovery<T>(work: () => Promise<T>) {
  if (recoveryRunning) throw new Error("Another device recovery operation is running.");
  recoveryRunning = true;
  try {
    // Web Locks serialize writes across tabs where the same device store is open.
    return await (navigator.locks ? navigator.locks.request("yomikura-device-recovery", work) : work());
  } finally { recoveryRunning = false; }
}
