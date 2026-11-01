import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../api/graphql/client";
import { useProgressBackend } from "./useProgressSynchronization";
import { isSelectedLibrary } from "../api/suwayomi/libraryUpdateState";
import type { ProgressBackend } from "../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../stores/useSettingsStore";

export function useLibraryUpdate() {
  const backend = useProgressBackend();
  const connected = useSettingsStore((state) => state.mockMode || state.connectionStatus === "connected");
  const queryClient = useQueryClient();
  const wasRunningRef = useRef({ key: "", running: false });

  const sdk = useMemo(() => {
    return backend ? createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live") : undefined;
  }, [backend]);

  const { data: statusData, refetch: refetchStatus, isError: isStatusError, isPending: isStatusLoading } = useQuery({
    queryKey: ["library-update-status", backend?.key],
    queryFn: ({ signal }) => sdk!.GetLibraryUpdateStatus(undefined, undefined, AbortSignal.any([signal, AbortSignal.timeout(15000)])),
    enabled: !!backend && connected,
    refetchInterval: (query) =>
      query.state.data?.libraryUpdateStatus?.jobsInfo?.isRunning ? 2000 : 30_000,
  });

  const jobsInfo = statusData?.libraryUpdateStatus?.jobsInfo;
  const isRunning = jobsInfo?.isRunning ?? false;
  const finishedJobs = jobsInfo?.finishedJobs ?? 0;
  const totalJobs = jobsInfo?.totalJobs ?? 0;

  const start = useMutation({
    mutationFn: async ({ backend, categories }: { backend: ProgressBackend; categories?: number[] }) => {
      if (!isSelectedLibrary(backend)) throw new Error("The selected library changed. Try again in its update screen.");
      const result = await createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live").UpdateLibrary({ input: categories?.length ? { categories } : {} }, undefined, AbortSignal.timeout(35000));
      if (!result.updateLibrary?.updateStatus?.jobsInfo) throw new Error("The library did not confirm the update request.");
      return result;
    },
    onSuccess: (_result, { backend }) => { void queryClient.invalidateQueries({ queryKey: ["library-update-status", backend.key] }); },
  });
  const stop = useMutation({ mutationFn: async (backend: ProgressBackend) => {
    if (!isSelectedLibrary(backend)) throw new Error("The selected library changed. Open its update screen again.");
    const id = crypto.randomUUID(), result = await createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live").StopLibraryUpdate({ input: { clientMutationId: id } }, undefined, AbortSignal.timeout(15000));
    if (result.updateStop?.clientMutationId !== id) throw new Error("The library did not confirm the stop request.");
  }, onSuccess: (_result, backend) => { void queryClient.invalidateQueries({ queryKey: ["library-update-status", backend.key] }); } });

  useEffect(() => {
    if (wasRunningRef.current.key === backend?.key && wasRunningRef.current.running && !isRunning && statusData?.libraryUpdateStatus) {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["updates"] });
      queryClient.invalidateQueries({ queryKey: ["library-insights", backend?.key] });
      queryClient.invalidateQueries({ queryKey: ["release-sample", backend?.key] });
      queryClient.invalidateQueries({ queryKey: ["release-estimates", backend?.key] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
      queryClient.invalidateQueries({ queryKey: ["manga-chapters"] });
    }
    wasRunningRef.current = { key: backend?.key ?? "", running: isRunning };
  }, [backend?.key, isRunning, queryClient, statusData]);

  return {
    isRunning,
    isStarting: start.isPending,
    isStopping: stop.isPending,
    finishedJobs,
    totalJobs,
    skipped: jobsInfo?.skippedMangasCount ?? 0,
    error: start.isError && start.variables?.backend.key === backend?.key ? start.error : stop.isError && stop.variables?.key === backend?.key ? stop.error : null,
    stopped: stop.isSuccess && stop.variables?.key === backend?.key,
    statusError: isStatusError || !!backend && !connected,
    statusLoading: !!backend && connected && isStatusLoading,
    retryStatus: () => void refetchStatus(),
    stopUpdate: () => { if (backend) stop.mutate(backend); },
    startUpdate: (categories?: number[]) => { if (backend) start.mutate({ backend, categories }); },
    canUpdate: !!backend && connected && !!statusData && !isStatusError && !isRunning && !start.isPending,
  };
}
