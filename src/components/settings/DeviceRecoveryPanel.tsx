import { useEffect, useState } from "react";
import { applyRecoveredProgress, captureDeviceRecovery, previewRecoveredProgress, recoveryBackend, removeStagedRecovery, restoreDevicePreferences, restoreDeviceRecords, selectRebuiltRecoveryLibrary, stageDeviceRecovery } from "../../api/suwayomi/deviceRecovery";
import { openRecoveryFile, type RecoveryManifest } from "../../api/suwayomi/deviceRecoveryFormat";
import { readRecoveryJob, type RecoveryJob } from "../../api/suwayomi/deviceRecoveryJournal";
import type { ProgressPatch } from "../../api/suwayomi/progressStorage";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useFeedback } from "../ui/FeedbackProvider";

function progressDescription(patch: Partial<ProgressPatch>) {
  return [patch.lastPageRead === undefined ? null : `page ${patch.lastPageRead + 1}`,
    patch.isRead === undefined ? null : patch.isRead ? "read" : "unread",
    patch.isBookmarked === undefined ? null : patch.isBookmarked ? "bookmarked" : "bookmark removed"].filter(Boolean).join(", ");
}

const count = (total: number, name: string) => `${total} ${name}${total === 1 ? "" : "s"}`;

export function DeviceRecoveryPanel() {
  const { confirm } = useFeedback();
  const [job, setJob] = useState<RecoveryJob>();
  const [manifest, setManifest] = useState<RecoveryManifest>();
  const [busy, setBusy] = useState(false);
  const [includePages, setIncludePages] = useState(false);
  const [includeSourceKeys, setIncludeSourceKeys] = useState(false);
  const connected = useSettingsStore((state) => !state.mockMode && state.connectionStatus === "connected");
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  const reload = async () => {
    const current = await readRecoveryJob();
    setJob(current);
    setManifest(undefined);
    if (current) setManifest((await openRecoveryFile(current.file)).manifest);
  };

  useEffect(() => {
    void reload().catch((error) => setFeedback({ text: error instanceof Error ? error.message : "Staged recovery could not be opened.", error: true }));
  }, []);

  const run = async (work: () => Promise<string | undefined>) => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const text = await work();
      await reload();
      if (text) setFeedback({ text });
    } catch (error) {
      const text = error instanceof DOMException && error.name === "QuotaExceededError"
        ? "There is too little free storage for this recovery. Free space and retry. A staged file remains available for retry."
        : error instanceof Error ? error.message : "Device recovery could not be completed. Try again.";
      setFeedback({ text, error: true });
      await reload().catch(() => undefined);
    } finally { setBusy(false); }
  };

  return <section className="border-t border-white/10 pt-5 space-y-4" aria-labelledby="device-recovery-title">
    <div>
      <h3 id="device-recovery-title" className="text-base font-semibold text-slate-200">Device recovery</h3>
      <p className="mt-2 text-sm text-slate-400">Take your reading preferences, device notes and pending progress with you. Include saved pages when you want to read offline on the new device. Keep a Suwayomi backup as well to recover your books and categories.</p>
    </div>
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={includePages} disabled={busy} onChange={(event) => setIncludePages(event.target.checked)} /> Include saved chapter pages from this device
    </label>
    <label className="flex items-start gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={includeSourceKeys && connected} disabled={busy || !connected} onChange={(event) => setIncludeSourceKeys(event.target.checked)} />
      <span>Include source identifiers for a rebuilt server <small className="block text-slate-400">Requires a connection. Keep this file with the Suwayomi backup for the same library.</small></span>
    </label>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} className="yomi-button yomi-button-secondary" onClick={() => void run(async () => {
        const file = await captureDeviceRecovery(recoveryBackend(), includePages, includeSourceKeys && connected);
        const url = URL.createObjectURL(file), anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `yomikura-device-${new Date().toISOString().slice(0, 10)}.yomirecovery`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        return "Device recovery export sent to downloads.";
      })}>Export device recovery</button>
      {!job && <label className={`yomi-button yomi-button-secondary ${busy ? "opacity-50" : "cursor-pointer"}`}>
        Open recovery file
        <input type="file" aria-label="Open recovery file" accept=".yomirecovery,application/octet-stream" className="sr-only" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file) void run(async () => { await stageDeviceRecovery(file); return "Recovery file verified and staged for review."; });
        }} />
      </label>}
    </div>
    {busy && <p role="status" className="text-sm text-slate-400">Working with device recovery…</p>}
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`text-sm ${feedback.error ? "text-red-400" : "text-slate-300"}`}>{feedback.text}</p>}

    {job && <div className="rounded-xl border border-white/10 bg-ink-950/35 p-4 space-y-4">
      <h4 className="font-semibold text-slate-200">Staged recovery</h4>
      {manifest && <>
        <p className="text-sm text-slate-400">{new Date(manifest.createdAt).toLocaleDateString()} · {count(manifest.notes.length, "note")} · {count(manifest.progress.length, "reading update")} · {count(manifest.chapters.length, "saved chapter")}</p>
        {job.rebuiltLibraryId && <p className="text-sm text-slate-300">Rebuilt library selected at {job.target}. Only records with matching source identifiers can be recovered.</p>}
        <div className="flex flex-wrap gap-3">
          {!!manifest.sourceKeys?.books.length && !job.target && <button type="button" disabled={busy || !connected} className="yomi-button yomi-button-secondary" onClick={() => void run(async () => {
            const backend = recoveryBackend();
            if (!await confirm({ title: "Use the rebuilt library?", detail: `Select this only after restoring the matching Suwayomi backup at ${backend.serverBaseUrl}. Yomikura matches books by source and matches chapters by their source links. You’ll review reading updates separately.`, confirmLabel: "Use this library" })) return;
            await selectRebuiltRecoveryLibrary(job.id, backend);
            return "This recovery file is tied to the rebuilt library.";
          })}>Use rebuilt library</button>}
          <button type="button" disabled={busy} className="yomi-button yomi-button-secondary" onClick={() => void run(async () => {
            const undo = job.preferencesApplied === true;
            if (!await confirm({ title: undo ? "Restore earlier preferences?" : "Apply recovered preferences?", detail: undo ? "Restore the reading and appearance preferences saved before this import." : "Apply these reading and appearance preferences to this device. Your earlier preferences stay available here.", confirmLabel: undo ? "Restore preferences" : "Apply preferences" })) return;
            await restoreDevicePreferences(job.id, undo);
            return undo ? "Earlier preferences restored." : "Recovered preferences applied.";
          })}>{job.preferencesApplied ? "Restore earlier preferences" : "Apply recovered preferences"}</button>
          {!!(manifest.notes.length || manifest.chapters.length) && <button type="button" disabled={busy || job.deviceRecordsRestored} className="yomi-button yomi-button-secondary" onClick={() => void run(async () => {
            if (!await confirm({ title: "Restore device records?", detail: "Add these note drafts and complete saved chapters to the matching library. Existing copies take precedence. You can retry from this file if recovery is interrupted.", confirmLabel: "Restore device records" })) return;
            await restoreDeviceRecords(job.id, recoveryBackend());
            await useDownloadStore.getState().loadCachedChapters();
            return "Device records restored. Notes are available as drafts and saved chapters can be opened offline.";
          })}>{job.deviceRecordsRestored ? "Device records restored" : "Restore notes and saved chapters"}</button>}
        </div>
        {!!manifest.progress.length && <div>
          <h5 className="font-semibold text-sm text-slate-200">Review pending progress</h5>
          <p className="mt-1 text-sm text-slate-400">Compare each saved update with your connected library before applying it.</p>
          <ul className="mt-3 max-h-80 overflow-y-auto space-y-3">
            {manifest.progress.map(({ chapter, patch }) => {
              const applied = job.reviewedProgress?.includes(chapter.chapterId);
              return <li key={chapter.chapterId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3 text-sm">
                <span><strong>{chapter.mangaTitle}</strong> · {chapter.chapterName} · {progressDescription(patch)}</span>
                <button type="button" aria-label={`Review progress for ${chapter.chapterName}`} disabled={busy || applied} className="yomi-button yomi-button-secondary" onClick={() => void run(async () => {
                  const backend = recoveryBackend(), reviewed = await previewRecoveredProgress(job.id, chapter.chapterId, backend);
                  if (!await confirm({ title: "Apply recovered progress?", detail: `${reviewed.identity.mangaTitle} · ${reviewed.identity.chapterName}. Current server: ${progressDescription(reviewed.snapshot)}. Saved update: ${progressDescription(patch)}.`, confirmLabel: "Apply saved update" })) return;
                  const added = await applyRecoveredProgress(job.id, chapter.chapterId, backend, reviewed);
                  return added ? "Saved update approved for synchronization." : "This recovered update was already queued for synchronization.";
                })}>{applied ? "Reviewed" : "Review update"}</button>
              </li>;
            })}
          </ul>
        </div>}
      </>}
      <button type="button" disabled={busy} className="yomi-text-link text-sm" onClick={() => void run(async () => {
        if (!await confirm({ title: "Remove the staged recovery file?", detail: "This clears the staged copy and its review list from Backups. The file you selected and any completed imports stay available.", confirmLabel: "Remove staged file" })) return;
        await removeStagedRecovery(job.id);
        return "Staged recovery removed.";
      })}>Remove staged file</button>
    </div>}
  </section>;
}
