import { createGraphqlClient } from "../../api/graphql/client";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { GraphqlError } from "../../api/graphql/transport";
import { addMissingBookNotes, bookNoteScope, getBookNoteDrafts } from "./bookNoteStorage";
import { rememberedLibrary } from "../../api/suwayomi/librarySession";
import { parseNoteExport, type NoteExport } from "./noteExportFormat";
export { parseNoteExport, type NoteExport } from "./noteExportFormat";

export async function captureNoteExport(backend: ProgressBackend): Promise<string> {
  const notes: NoteExport["notes"] = [];
  for (const draft of await getBookNoteDrafts()) {
    let parts: unknown; try { parts = JSON.parse(draft.key); } catch { continue; }
    if (!Array.isArray(parts) || parts[0] !== backend.key) continue;
    if (parts[3] !== (backend.isDemo ? undefined : backend.libraryId ?? rememberedLibrary(backend.serverBaseUrl)?.marker)) continue;
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
  const selected = () => { const settings = useSettingsStore.getState(), current = progressBackend(settings.serverBaseUrl, settings.mockMode); if (current.key !== backend.key || current.libraryId !== backend.libraryId) throw new Error("The selected library changed. Open the note import again."); };
  const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
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
