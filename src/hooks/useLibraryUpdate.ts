import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";

export function useLibraryUpdate() {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const wasRunningRef = useRef(false);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["library-update-status", serverBaseUrl],
    queryFn: () => sdk.GetLibraryUpdateStatus(),
    enabled: !!serverBaseUrl,
    refetchInterval: (query) =>
      query.state.data?.libraryUpdateStatus?.jobsInfo?.isRunning ? 2000 : 30_000,
  });

  const jobsInfo = statusData?.libraryUpdateStatus?.jobsInfo;
  const isRunning = jobsInfo?.isRunning ?? false;
  const finishedJobs = jobsInfo?.finishedJobs ?? 0;
  const totalJobs = jobsInfo?.totalJobs ?? 0;

  const { mutate: startUpdate, isPending: isStarting } = useMutation({
    mutationFn: () => sdk.UpdateLibrary({ input: {} }),
    onSuccess: () => {
      void refetchStatus();
    },
  });

  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["updates"] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
      queryClient.invalidateQueries({ queryKey: ["manga-chapters"] });
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, queryClient]);

  return {
    isRunning,
    isStarting,
    finishedJobs,
    totalJobs,
    startUpdate: () => startUpdate(),
    canUpdate: !!serverBaseUrl && !isRunning && !isStarting,
  };
}