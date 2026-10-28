import { useState } from "react";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { captureNoteExport, downloadNoteExport, importNoteExport, parseNoteExport } from "../../features/manga/notePortability";
import { useFeedback } from "../ui/FeedbackProvider";
export function NotePortabilityPanel() {
  const { serverBaseUrl, mockMode } = useSettingsStore(), { confirm } = useFeedback();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const backend = progressBackend(serverBaseUrl, mockMode);
  return <section className="border-t border-white/10 pt-5" aria-labelledby="note-portability-title"><h3 id="note-portability-title" className="text-base font-semibold text-slate-200">Your book notes</h3><p className="mt-2 text-sm text-slate-400">Export notes saved on this device, including unsynced drafts. Imports add matching books without replacing existing device notes. Review a note before syncing it to your library.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy} className="yomi-button yomi-button-secondary" onClick={async () => { setBusy(true); try { downloadNoteExport(await captureNoteExport(backend)); setMessage("Your device notes were sent to downloads."); } catch { setMessage("Notes could not be exported. Check device storage and retry."); } finally { setBusy(false); } }}>Export device notes</button><label className={`yomi-button yomi-button-secondary ${busy ? "opacity-50" : "cursor-pointer"}`}>Import device notes<input type="file" aria-label="Import device notes" accept=".json" className="sr-only" disabled={busy} onChange={async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a note file smaller than 10 MB.");
      const text = await file.text(), value = parseNoteExport(text);
      if (await confirm({ title: "Import book notes?", detail: `Check ${value.notes.length} note${value.notes.length === 1 ? "" : "s"} against the selected library's book names and IDs? Existing device notes stay untouched. Imported notes remain drafts until you sync them.`, confirmLabel: "Import notes" })) {
        const result = await importNoteExport(text, backend); setMessage(`${result.added} added · ${result.kept} existing notes kept · ${result.unmatched} unmatched books skipped.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Notes could not be imported. Nothing was replaced."); } finally { setBusy(false); }
  }} /></label></div>{message && <p className="mt-3 text-sm text-slate-400" role="status">{message}</p>}</section>;
}
