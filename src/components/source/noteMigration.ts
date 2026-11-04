import { createGraphqlClient } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { acknowledgeBookNote, BOOK_NOTE_KEY, bookNoteScope, getBookNoteDraft, noteHasConflict, remoteNote, saveBookNoteIfUnchanged, type BookNoteDraft } from "../../features/manga/bookNoteStorage";
type Book = { id: number; title: string };
type Snapshot = { key: string; remote: string; local?: BookNoteDraft };
export type MigrationNotes = { source: Snapshot; target: Snapshot; value: string };
function effective(snapshot: Snapshot) {
  if (!snapshot.local?.pending) return snapshot.remote;
  if (!noteHasConflict(snapshot.local, snapshot.remote)) return snapshot.local.value;
  return `${snapshot.remote}\n\n— Unsynced device version —\n${snapshot.local.value || "(Note cleared on this device)"}`.trim();
}
async function load(backend: ProgressBackend, book: Book): Promise<Snapshot> {
  const key = bookNoteScope(backend, book.id, book.title), sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
  const [local, { manga }] = await Promise.all([getBookNoteDraft(key), sdk.GetMangaNotes({ id: book.id }, undefined, AbortSignal.timeout(10000))]);
  if (manga.id !== book.id) throw new Error("The book notes could not be verified. Refresh the migration review.");
  return { key, remote: remoteNote(manga.meta), local };
}
export async function loadMigrationNotes(backend: ProgressBackend, sourceBook: Book, targetBook: Book): Promise<MigrationNotes> {
  const [source, target] = await Promise.all([load(backend, sourceBook), load(backend, targetBook)]);
  const left = effective(target), right = effective(source), addition = `\n\n— From ${sourceBook.title} —\n${right}`;
  const value = !right || left === right || left.endsWith(addition) ? left : !left ? right : left + addition;
  if (value.length > 20000) throw new Error("The combined notes exceed 20,000 characters. Export and shorten them before migrating; no notes were discarded.");
  return { source, target, value };
}
export async function copyMigrationNotes(backend: ProgressBackend, sourceBook: Book, targetBook: Book, reviewed: MigrationNotes, check: () => void) {
  const current = await loadMigrationNotes(backend, sourceBook, targetBook); check();
  if (JSON.stringify(current) !== JSON.stringify(reviewed)) throw new Error("Book notes changed after the review. Refresh the mapping before migrating.");
  if (!reviewed.value && !reviewed.target.local) return;
  const draft = { key: reviewed.target.key, value: reviewed.value, base: reviewed.target.remote, pending: true, revision: crypto.randomUUID() };
  if (!await saveBookNoteIfUnchanged(draft, reviewed.target.local?.revision)) throw new Error("The destination note was edited. Both notes are kept; refresh the review.");
  check();
  if (draft.value !== current.target.remote) {
    const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
    const saved = (await sdk.SaveMangaNote({ input: { meta: { mangaId: targetBook.id, key: BOOK_NOTE_KEY, value: draft.value } } }, undefined, AbortSignal.timeout(15000))).setMangaMeta?.meta;
    check();
    if (!saved || saved.mangaId !== targetBook.id || saved.key !== BOOK_NOTE_KEY || saved.value !== draft.value) throw new Error("The library did not confirm the copied note. The original and destination draft are kept.");
  }
  if (!await acknowledgeBookNote(draft)) throw new Error("A newer destination note was kept. Review it before replacing the original book.");
}
export async function verifyMigrationSourceNote(backend: ProgressBackend, sourceBook: Book, reviewed: MigrationNotes) {
  if (JSON.stringify(await load(backend, sourceBook)) !== JSON.stringify(reviewed.source)) throw new Error("The original note changed during copying. Keep the original and refresh the review.");
}
