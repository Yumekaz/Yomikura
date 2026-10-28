import { createGraphqlClient } from "../../api/graphql/client";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { GraphqlError } from "../../api/graphql/transport";
import { addMissingBookNotes, bookNoteScope, getBookNoteDrafts } from "./bookNoteStorage";

export type NoteExport = { format: "yomikura-notes"; version: 1; createdAt: string; notes: { mangaId: number; title: string; value: string }[] };
const MAX_BYTES = 10 * 1024 * 1024;
export function parseNoteExport(text: string): NoteExport {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("The note file exceeds the 10 MB limit.");
  const input = JSON.parse(text) as NoteExport;
  if (input?.format !== "yomikura-notes" || input.version !== 1 || !Array.isArray(input.notes) || input.notes.length > 10000) throw new Error("Choose a Yomikura note export.");
  const ids = new Set<string>();
  for (const note of input.notes) {
    const identity = JSON.stringify([note?.mangaId, note?.title]);
    if (!note || !Number.isSafeInteger(note.mangaId) || note.mangaId < 0 || ids.has(identity) || typeof note.title !== "string" || !note.title || note.title.length > 2000 || typeof note.value !== "string" || note.value.length > 20000) throw new Error("The note file contains invalid or repeated book identities.");
    ids.add(identity);
  }
  return { format: "yomikura-notes", version: 1, createdAt: typeof input.createdAt === "string" ? input.createdAt : "", notes: input.notes.map(({ mangaId, title, value }) => ({ mangaId, title, value })) };
}
export async function captureNoteExport(backend: ProgressBackend): Promise<string> {
  const notes: NoteExport["notes"] = [];
  for (const draft of await getBookNoteDrafts()) {
    let parts: unknown; try { parts = JSON.parse(draft.key); } catch { continue; }
    if (!Array.isArray(parts) || parts[0] !== backend.key) continue;
    notes.push({ mangaId: parts[1], title: parts[2], value: draft.value });
  }
  const text = JSON.stringify({ format: "yomikura-notes", version: 1, createdAt: new Date().toISOString(), notes });
  parseNoteExport(text); return text;
}
export function downloadNoteExport(text: string, filename = "yomikura-notes.json") {
  parseNoteExport(text);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function importNoteExport(text: string, backend: ProgressBackend) {
  const exported = parseNoteExport(text), drafts = []; let unmatched = 0;
  const selected = () => { const settings = useSettingsStore.getState(); if (progressBackend(settings.serverBaseUrl, settings.mockMode).key !== backend.key) throw new Error("The selected library changed. Open the note import again."); };
  const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live");
  for (const note of exported.notes) {
    selected();
    let manga;
    try { manga = (await sdk.GetMigrationManga({ id: note.mangaId }, undefined, AbortSignal.timeout(10000))).manga; }
    catch (error) { if (error instanceof GraphqlError && (error.response.status === 404 || /(?:not found|non null type ['"]?Manga)/i.test(error.message))) { unmatched += 1; continue; } throw error; }
    selected();
    if (manga.id !== note.mangaId || manga.title !== note.title) { unmatched += 1; continue; }
    drafts.push({ key: bookNoteScope(backend, note.mangaId, note.title), value: note.value, base: null, pending: true, revision: crypto.randomUUID() });
  }
  selected();
  return { ...await addMissingBookNotes(drafts), unmatched };
}
