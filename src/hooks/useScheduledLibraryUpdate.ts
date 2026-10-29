import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useProgressBackend } from "./useProgressSynchronization";
import { isSelectedLibrary, recordLibraryUpdateRequest } from "../api/suwayomi/libraryUpdateState";
import { acquireProgressLease, releaseProgressLease } from "../api/suwayomi/progressStorage";

const MINUTE = 60_000;

export function useScheduledLibraryUpdate() {
  const queryClient = useQueryClient();
  const running = useRef(new Set<string>());
  const backend = useProgressBackend();
  const { connectionStatus, libraryUpdateIntervalHours, experience } = useSettingsStore();
  const requestedAt = backend ? experience.libraryUpdateRuns[backend.key]?.requestedAt ?? 0 : 0;

  useEffect(() => {
    if (!libraryUpdateIntervalHours || !backend || backend.isDemo || connectionStatus !== "connected") return;
    const intervalMs = libraryUpdateIntervalHours * 60 * MINUTE;
    const runIfDue = async () => {
      if (running.current.has(backend.key) || !isSelectedLibrary(backend) || Date.now() - requestedAt < intervalMs) return;
      running.current.add(backend.key);
      const owner = crypto.randomUUID(), lease = { ...backend, key: `${backend.key}:library-update` };
      try {
        if (!await acquireProgressLease(lease, owner) || !isSelectedLibrary(backend)) return;
        recordLibraryUpdateRequest(backend, "running");
        const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, "live");
        const status = await sdk.GetLibraryUpdateStatus(undefined, undefined, AbortSignal.timeout(15000));
        if (!isSelectedLibrary(backend)) return;
        if (!status.libraryUpdateStatus.jobsInfo.isRunning) {
          const result = await sdk.UpdateLibrary({ input: {} }, undefined, AbortSignal.timeout(35000));
          if (!result.updateLibrary?.updateStatus?.jobsInfo) throw new Error("Unconfirmed update request");
        }
        recordLibraryUpdateRequest(backend, "success");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["library"] }),
          queryClient.invalidateQueries({ queryKey: ["updates"] }),
        ]);
      } catch {
        recordLibraryUpdateRequest(backend, "error", "The library could not confirm the scheduled update request.");
      } finally {
        await releaseProgressLease(lease, owner).catch(() => undefined);
        running.current.delete(backend.key);
        if (!isSelectedLibrary(backend) && useSettingsStore.getState().experience.libraryUpdateRuns[backend.key]?.status === "running") recordLibraryUpdateRequest(backend, "idle");
      }
    };
    void runIfDue();
    const timer = window.setInterval(() => void runIfDue(), Math.min(intervalMs, 15 * MINUTE));
    return () => window.clearInterval(timer);
  }, [backend, connectionStatus, requestedAt, libraryUpdateIntervalHours, queryClient]);
}
