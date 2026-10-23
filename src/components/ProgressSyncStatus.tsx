import { useQuery } from "@tanstack/react-query";
import { getProgressOperations, retryBlockedProgress } from "../api/suwayomi/progressStorage";
import { resolveProgressConflict, synchronizeProgress } from "../api/suwayomi/progressSync";
import { useProgressBackend } from "../hooks/useProgressSynchronization";
import { useFeedback } from "./ui/FeedbackProvider";
import type { ProgressOperation } from "../api/suwayomi/progressStorage";

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
  const status = useQuery({ queryKey: ["progress-sync", backend?.key], queryFn: () => getProgressOperations(backend!), enabled: !!backend, retry: false });
  if (!backend || backend.isDemo || (!status.error && !status.data?.length)) return null;
  const blocked = status.data?.find((operation) => operation.status === "blocked");
  return <div className="mt-2 max-w-sm rounded-lg border border-white/10 bg-ink-950/95 px-3 py-2 text-xs leading-5 text-slate-300" role="status" aria-label="Progress synchronization">
    <p>{status.error ? "Progress storage is unavailable on this device." : blocked ? `${blocked.chapter.chapterName}: ${blocked.error}` : `Progress saved on this device · ${status.data!.length} pending`}</p>
    {blocked && <ConflictActions operation={blocked} />}
    <button type="button" className="mt-1 font-semibold text-yomi-jade hover:underline" onClick={() => void (async () => {
      await retryBlockedProgress(backend);
      await synchronizeProgress(backend);
      await status.refetch();
    })().catch(() => status.refetch())}>Retry sync</button>
  </div>;
}
