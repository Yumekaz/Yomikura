import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Link2 } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";

export function TrackerSettingsPanel() {
  const { serverBaseUrl } = useSettingsStore();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["global-trackers", serverBaseUrl],
    queryFn: () => sdk.GetTrackers(),
    enabled: !!serverBaseUrl,
  });

  const trackers = data?.trackers?.nodes ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading trackers…
      </div>
    );
  }

  if (isError) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="text-xs text-red-400 hover:underline"
      >
        Failed to load trackers — retry
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {trackers.length === 0 && (
        <p className="text-xs text-slate-500">No trackers configured on your Suwayomi server.</p>
      )}
      {trackers.map((tracker) => (
        <div
          key={tracker.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-ink-950/30 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-200">{tracker.name}</p>
            <p className="text-[10px] text-slate-500">
              {tracker.isLoggedIn ? "Logged in" : "Not logged in"} · {tracker.icon}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tracker.isLoggedIn ? (
              <span className="text-[10px] font-bold text-yomi-jade">●</span>
            ) : (
              <a
                href={tracker.authUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/5"
              >
                <Link2 className="h-3 w-3" />
                Login
              </a>
            )}
            {tracker.scores && (
              <a
                href={`${serverBaseUrl.replace(/\/$/, "")}/settings/trackers`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-500 hover:text-yomi-jade"
                title="Open in Suwayomi settings"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-slate-500">
        Per-manga tracking is available on each manga detail page. Link accounts above via Suwayomi.
      </p>
    </div>
  );
}