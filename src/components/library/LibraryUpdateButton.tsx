import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useLibraryUpdate } from "../../hooks/useLibraryUpdate";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";

function formatIntervalHours(hours: number): string {
  if (hours <= 0) return "disabled";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

export function LibraryUpdateButton() {
  const backend = useProgressBackend();
  const { isRunning, isStarting, isStopping, finishedJobs, totalJobs, startUpdate, canUpdate, stopUpdate, error, statusError, retryStatus, statusLoading } =
    useLibraryUpdate();

  const sdk = useMemo(() => {
    return backend ? createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live") : undefined;
  }, [backend]);

  const { data: settingsData } = useQuery({
    queryKey: ["server-settings", backend?.key],
    queryFn: () => sdk!.GetServerSettings(),
    enabled: !!backend,
    staleTime: 300_000,
  });

  const intervalHours = settingsData?.settings?.globalUpdateInterval ?? 0;
  const intervalLabel = formatIntervalHours(intervalHours);

  const label = isRunning
    ? totalJobs > 0
      ? `Updating ${finishedJobs}/${totalJobs}`
      : "Updating library…"
    : isStarting ? "Requesting update…" : statusLoading ? "Checking status…" : "Check for updates";

  const title =
    intervalHours > 0
      ? `Fetch new chapters from all library sources. Suwayomi also auto-checks every ${intervalLabel}.`
      : "Check the books in your library for new chapters.";

  return (
    <div className="flex flex-wrap items-center gap-2"><button
      type="button"
      onClick={() => startUpdate()}
      disabled={!canUpdate}
      title={title}
      aria-label={label}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-yomi-jade/30 hover:bg-yomi-jade/10 hover:text-yomi-mint disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isRunning || isStarting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-yomi-jade" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>{isRunning && <button type="button" className="yomi-button yomi-button-secondary" disabled={isStopping} onClick={stopUpdate}>{isStopping ? "Stopping…" : "Stop updates"}</button>}
    {statusError && <button type="button" className="yomi-text-link text-xs" onClick={retryStatus}>Retry update status</button>}
    {error && <span className="text-xs text-red-400" role="alert">The library couldn’t confirm that request. Check its status and try again.</span>}</div>
  );
}
