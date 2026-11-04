import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../../api/graphql/client";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { checkExtensionUpdates } from "./extensionUpdateCheck";

export function useExtensionUpdates() {
  const backend = useProgressBackend();
  const { serverBaseUrl, mockMode, connectionStatus } = useSettingsStore();
  const queryClient = useQueryClient();
  const queryKey = ["extensions", serverBaseUrl, mockMode, backend?.libraryId] as const;
  const load = (signal?: AbortSignal, force = false) => {
    if (!backend) throw new Error("Connect a library before checking its sources.");
    const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live");
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Browser storage may be restricted. */ }
    return checkExtensionUpdates(sdk, backend, { force, signal, storage, isCurrent: () => isSelectedLibrary(backend) });
  };
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    enabled: !!backend && (mockMode || connectionStatus === "connected" && !!backend.libraryId),
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const outdated = useMemo(() => query.data?.extensions.nodes.filter((extension) => extension.isInstalled && extension.hasUpdate) ?? [], [query.data]);
  return {
    ...query,
    backend,
    outdated,
    canCheck: !!backend && (mockMode || connectionStatus === "connected" && !!backend.libraryId),
    backendKey: backend ? JSON.stringify([backend.key, backend.libraryId ?? null]) : "",
    refreshCatalog: () => queryClient.fetchQuery({ queryKey, queryFn: ({ signal }) => load(signal, true), staleTime: 0 }),
  };
}
