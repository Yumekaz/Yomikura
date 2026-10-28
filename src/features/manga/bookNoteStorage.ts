import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
export const BOOK_NOTE_KEY = "yomikura.notes.v1";
export interface BookNoteDraft { key: string; value: string; base: string | null; revision: string; pending: boolean }
export const bookNoteScope = (backend: ProgressBackend, mangaId: number, title: string) => JSON.stringify([backend.key, mangaId, title]);
export function remoteNote(meta: { key: string; value: string }[]) { return meta.find((item) => item.key === BOOK_NOTE_KEY)?.value ?? ""; }
export function noteHasConflict(draft: Pick<BookNoteDraft, "base" | "value">, remote: string) { return remote !== draft.value && (draft.base === null ? remote !== "" : remote !== draft.base); }

async function noteTransaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("yomikura-book-notes", 1); request.onupgradeneeded = () => request.result.createObjectStore("notes", { keyPath: "key" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.onversionchange = () => db.close();
  const tx = db.transaction("notes", mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("Note storage could not be written.")); });
  try { const result = await work(tx.objectStore("notes")); await done; return result; } catch (error) { try { tx.abort(); } catch { /* Already settled. */ } await done.catch(() => undefined); throw error; } finally { db.close(); }
}
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
export const getBookNoteDraft = (key: string) => noteTransaction("readonly", (store) => read<BookNoteDraft | undefined>(store.get(key)));
export const saveBookNoteDraft = (draft: BookNoteDraft) => noteTransaction("readwrite", async (store) => { await read(store.put(draft)); });
/** A late server acknowledgment cannot erase a newer edit from this or another tab. */
export const acknowledgeBookNote = (draft: BookNoteDraft) => noteTransaction("readwrite", async (store) => {
  const latest = await read<BookNoteDraft | undefined>(store.get(draft.key));
  if (latest?.revision !== draft.revision) return false;
  await read(store.put({ ...draft, base: draft.value, pending: false })); return true;
});
