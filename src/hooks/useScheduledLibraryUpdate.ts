import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";

const MINUTE = 60_000;

export function useScheduledLibraryUpdate() {
  const queryClient = useQueryClient();
  const running = useRef(false);
  const { connectionStatus, lastLibraryUpdateAt, libraryUpdateIntervalHours, mockMode, serverBaseUrl, setScheduledLibraryUpdateResult } = useSettingsStore();

  useEffect(() => {
    if (!libraryUpdateIntervalHours || mockMode || connectionStatus !== "connected" || !serverBaseUrl) return;
    const intervalMs = libraryUpdateIntervalHours * 60 * MINUTE;
    const runIfDue = async () => {
      if (running.current || Date.now() - lastLibraryUpdateAt < intervalMs) return;
      running.current = true;
      setScheduledLibraryUpdateResult("running");
      try {
        const endpoint = `${serverBaseUrl.replace(/\/$/, "")}/api/graphql`;
        await createGraphqlClient(endpoint).UpdateLibrary({ input: {} });
        setScheduledLibraryUpdateResult("success");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["library"] }),
          queryClient.invalidateQueries({ queryKey: ["updates"] }),
        ]);
      } catch (error: any) {
        setScheduledLibraryUpdateResult("error", error?.message || String(error));
      } finally {
        running.current = false;
      }
    };
    void runIfDue();
    const timer = window.setInterval(() => void runIfDue(), Math.min(intervalMs, 15 * MINUTE));
    return () => window.clearInterval(timer);
  }, [connectionStatus, lastLibraryUpdateAt, libraryUpdateIntervalHours, mockMode, queryClient, serverBaseUrl, setScheduledLibraryUpdateResult]);
}
