import { useQuery } from "@tanstack/react-query";
import { dismissTracking, getPendingTracking, getProgressOperations, retryBlockedProgress } from "../api/suwayomi/progressStorage";
import { resolveProgressConflict, synchronizeProgress } from "../api/suwayomi/progressSync";
import { useProgressBackend } from "../hooks/useProgressSynchronization";
import { useFeedback } from "./ui/FeedbackProvider";
import type { ProgressOperation } from "../api/suwayomi/progressStorage";
import { synchronizeTracking } from "../api/suwayomi/trackingSync";

function ConflictActions({ operation }: { operation: ProgressOperation }) {
  const { confirm, notify } = useFeedback();
  const resolve = async (saved: boolean) => {
    if (!await confirm({ title: "Resolve reading progress?", detail: saved ? `Use this device’s saved position for “${operation.chapter.chapterName}”? This replaces its current server progress.` : `Keep Suwayomi’s position for “${operation.chapter.chapterName}”? This replaces the pending change saved on this device.`, confirmLabel: saved ? "Use saved progress" : "Keep server progress" })) return;
    try {
      await resolveProgressConflict(operation.backend, operation.chapter.chapterId, saved, operation.sequence);
      if (window.location.pathname.startsWith("/reader/")) window.location.reload();
    }
    catch (error) { notify(error instanceof Error ? error.message : "Progress could not be resolved.", "error"); }
  };
  return <div className="mt-1 flex flex-wrap gap-x-3">
    <button type="button" className="font-semibold text-yomi-jade underline" onClick={() => void resolve(true)}>Use saved progress</button>
    <button type="button" className="font-semibold text-yomi-jade underline" onClick={() => void resolve(false)}>Keep server progress</button>
  </div>;
}

export function ProgressSyncStatus() {
  const backend = useProgressBackend();
  const { confirm, notify } = useFeedback();
  const status = useQuery({ queryKey: ["progress-sync", backend?.key], queryFn: async () => ({ operations: await getProgressOperations(backend!), tracking: await getPendingTracking(backend!) }), enabled: !!backend, retry: false });
  const operations = status.data?.operations ?? [];
  const tracking = status.data?.tracking ?? [];
  if (!backend || backend.isDemo || (!status.error && !operations.length && !tracking.length)) return null;
  const blocked = operations.find((operation) => operation.status === "blocked");
  const trackerError = tracking.find((head) => head.trackingError)?.trackingError;
  const trackedTitles = new Set(tracking.map((head) => head.chapter.mangaId)).size;
  return <div className="mt-2 max-w-sm rounded-lg border border-white/10 bg-ink-950/95 px-3 py-2 text-xs leading-5 text-slate-300" role="status" aria-label="Progress synchronization">
    <p>{status.error ? "Progress storage is unavailable on this device." : blocked ? `${blocked.chapter.chapterName}: ${blocked.error}` : operations.length ? `Progress saved on this device · ${operations.length} pending` : "Reading progress is saved."}</p>
    {!!tracking.length && <p>Tracker sync pending · {trackedTitles} {trackedTitles === 1 ? "title" : "titles"}{trackerError ? ` · ${trackerError}` : ""}</p>}
    {blocked && <ConflictActions operation={blocked} />}
    <button type="button" className="mt-1 font-semibold text-yomi-jade hover:underline" onClick={() => void (async () => {
      await retryBlockedProgress(backend);
      await synchronizeProgress(backend);
      await synchronizeTracking(backend, { force: true });
      await status.refetch();
    })().catch(() => status.refetch())}>Retry sync</button>
    {trackerError && <button type="button" className="ml-3 mt-1 font-semibold text-slate-300 underline" onClick={() => void (async () => {
      if (!await confirm({ title: "Dismiss tracker retries?", detail: "Stop retrying these tracker updates? Reading progress stays saved. You can synchronize linked trackers manually from the title later.", confirmLabel: "Dismiss tracker retries" })) return;
      try { await dismissTracking(backend, tracking); await status.refetch(); }
      catch (error) { notify(error instanceof Error ? error.message : "Tracker retries changed. Review them again.", "error"); }
    })()}>Dismiss tracker retries</button>}
  </div>;
}
