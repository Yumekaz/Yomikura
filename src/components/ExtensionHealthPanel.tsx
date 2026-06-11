import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Puzzle } from "lucide-react";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";

export function ExtensionHealthPanel() {
  const { serverBaseUrl, connectionStatus } = useSettingsStore();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["extension-health", serverBaseUrl],
    queryFn: () => sdk.GetExtensions(),
    enabled: connectionStatus === "connected" && !!serverBaseUrl,
    staleTime: 60_000,
  });

  const extensions = data?.extensions?.nodes ?? [];
  const broken = extensions.filter((e) => e?.isInstalled && e?.isObsolete);
  const outdated = extensions.filter((e) => e?.isInstalled && e?.hasUpdate);
  const healthy = extensions.filter((e) => e?.isInstalled && !e?.isObsolete && !e?.hasUpdate);

  if (connectionStatus !== "connected") {
    return (
      <p className="text-xs text-slate-500">Connect to Suwayomi to view extension health.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Scanning extensions…
      </div>
    );
  }

  if (isError) {
    return <p className="text-xs text-red-400">Failed to load extension status.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg border border-white/5 bg-ink-950/40 p-3">
          <p className="text-lg font-bold text-yomi-jade">{healthy.length}</p>
          <p className="text-slate-500">Healthy</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-ink-950/40 p-3">
          <p className="text-lg font-bold text-amber-300">{outdated.length}</p>
          <p className="text-slate-500">Updates</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-ink-950/40 p-3">
          <p className="text-lg font-bold text-red-400">{broken.length}</p>
          <p className="text-slate-500">Obsolete</p>
        </div>
      </div>

      {(outdated.length > 0 || broken.length > 0) && (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {[...broken, ...outdated].slice(0, 12).map((ext) => (
            <li
              key={ext!.pkgName}
              className="flex items-center gap-2 rounded border border-white/5 bg-ink-950/30 px-2 py-1.5"
            >
              {ext?.isObsolete ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <Puzzle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              )}
              <span className="truncate text-slate-300">{ext?.name || ext?.pkgName}</span>
              <span className="ml-auto shrink-0 text-slate-500">
                {ext?.isObsolete ? "obsolete" : "update"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {extensions.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-yomi-jade" />
          No extensions installed yet.
        </p>
      )}
    </div>
  );
}