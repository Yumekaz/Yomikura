import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { rememberedLibrary } from "../../api/suwayomi/librarySession";
import { assertManagedDeviceDataAddress } from "../../api/suwayomi/managedLibraryLocations";
export const BOOK_NOTE_KEY = "yomikura.notes.v1";
export interface BookNoteDraft { key: string; value: string; base: string | null; revision: string; pending: boolean }
export const bookNoteScope = (backend: ProgressBackend, mangaId: number, title: string) => {
  const marker = backend.isDemo ? undefined : backend.libraryId ?? rememberedLibrary(backend.serverBaseUrl)?.marker;
  return JSON.stringify(marker ? [backend.key, mangaId, title, marker] : [backend.key, mangaId, title]);
};
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

function noteOrigin(key: string) {
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || typeof parts[0] !== "string") return;
    const backend = JSON.parse(parts[0]);
    if (!Array.isArray(backend) || backend[0] !== "live" || typeof backend[1] !== "string") return;
    return { server: backend[1], libraryId: typeof parts[3] === "string" ? parts[3] : undefined, mangaId: parts[1], title: parts[2] };
  } catch {
    return;
  }
}

function assertNoteAddress(key: string) {
  const origin = noteOrigin(key);
  if (origin) assertManagedDeviceDataAddress(origin.server, origin.libraryId);
}

export const getBookNoteDraft = (key: string) => noteTransaction("readonly", (store) => read<BookNoteDraft | undefined>(store.get(key)));
export const saveBookNoteDraft = (draft: BookNoteDraft) => noteTransaction("readwrite", async (store) => {
  assertNoteAddress(draft.key);
  await read(store.put(draft));
});
export const getBookNoteDrafts = () => noteTransaction("readonly", (store) => read<BookNoteDraft[]>(store.getAll()));
export const saveBookNoteIfUnchanged = (draft: BookNoteDraft, revision?: string) => noteTransaction("readwrite", async (store) => {
  assertNoteAddress(draft.key);
  const current = await read<BookNoteDraft | undefined>(store.get(draft.key));
  if (current?.revision !== revision) return false;
  await read(store.put(draft)); return true;
});
/** Import is one transaction; independently edited notes are never overwritten. */
export const addMissingBookNotes = (drafts: BookNoteDraft[]) => noteTransaction("readwrite", async (store) => {
  let added = 0, kept = 0;
  for (const draft of drafts) {
    assertNoteAddress(draft.key);
    const current = await read<BookNoteDraft | undefined>(store.get(draft.key));
    if (current) { kept += 1; continue; }
    await read(store.add(draft)); added += 1;
  }
  return { added, kept };
});
/** A late server acknowledgment cannot erase a newer edit from this or another tab. */
export const acknowledgeBookNote = (draft: BookNoteDraft) => noteTransaction("readwrite", async (store) => {
  assertNoteAddress(draft.key);
  const latest = await read<BookNoteDraft | undefined>(store.get(draft.key));
  if (latest?.revision !== draft.revision) return false;
  await read(store.put({ ...draft, base: draft.value, pending: false })); return true;
});

export const moveManagedBookNotes = (from: string, to: string, marker: string) => noteTransaction("readwrite", async (store) => {
  const backendKey = JSON.stringify(["live", to]);
  for (const draft of await read<BookNoteDraft[]>(store.getAll())) {
    const origin = noteOrigin(draft.key);
    if (origin?.server !== from || origin.libraryId !== marker) continue;
    const key = JSON.stringify([backendKey, origin.mangaId, origin.title, marker]);
    if (await read(store.getKey(key)) !== undefined) continue;
    await read(store.add({ ...draft, key }));
    await read(store.delete(draft.key));
  }
});
