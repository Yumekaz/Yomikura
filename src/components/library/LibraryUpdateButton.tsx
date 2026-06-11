import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useLibraryUpdate } from "../../hooks/useLibraryUpdate";
import { useSettingsStore } from "../../stores/useSettingsStore";

function formatIntervalHours(hours: number): string {
  if (hours <= 0) return "disabled";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

export function LibraryUpdateButton() {
  const { serverBaseUrl } = useSettingsStore();
  const { isRunning, isStarting, finishedJobs, totalJobs, startUpdate, canUpdate } =
    useLibraryUpdate();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data: settingsData } = useQuery({
    queryKey: ["server-settings", serverBaseUrl],
    queryFn: () => sdk.GetServerSettings(),
    enabled: !!serverBaseUrl,
    staleTime: 300_000,
  });

  const intervalHours = settingsData?.settings?.globalUpdateInterval ?? 0;
  const intervalLabel = formatIntervalHours(intervalHours);

  const label = isRunning
    ? totalJobs > 0
      ? `Updating ${finishedJobs}/${totalJobs}`
      : "Updating library…"
    : "Check for updates";

  const title =
    intervalHours > 0
      ? `Fetch new chapters from all library sources. Suwayomi also auto-checks every ${intervalLabel}.`
      : "Fetch new chapters from all library sources (Mihon-style library update).";

  return (
    <button
      type="button"
      onClick={() => startUpdate()}
      disabled={!canUpdate}
      title={title}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-yomi-jade/30 hover:bg-yomi-jade/10 hover:text-yomi-mint disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isRunning || isStarting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-yomi-jade" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}