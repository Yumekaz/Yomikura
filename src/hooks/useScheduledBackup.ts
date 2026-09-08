import { useEffect, useRef } from "react";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";

const MINUTE = 60_000;

export function useScheduledBackup() {
  const running = useRef(false);
  const { backupIntervalHours, connectionStatus, lastScheduledBackupAt, mockMode, serverBaseUrl, setScheduledBackupResult } = useSettingsStore();

  useEffect(() => {
    if (!backupIntervalHours || mockMode || connectionStatus !== "connected" || !serverBaseUrl) return;
    const intervalMs = backupIntervalHours * 60 * MINUTE;

    const runIfDue = async () => {
      if (running.current || Date.now() - lastScheduledBackupAt < intervalMs) return;
      running.current = true;
      setScheduledBackupResult("running");
      try {
        const endpoint = `${serverBaseUrl.replace(/\/$/, "")}/api/graphql`;
        const result = await createGraphqlClient(endpoint).CreateBackup({ input: {} });
        if (!result.createBackup?.url) throw new Error("Suwayomi did not return a backup file.");
        setScheduledBackupResult("success");
      } catch (error: any) {
        setScheduledBackupResult("error", error?.message || String(error));
      } finally {
        running.current = false;
      }
    };

    void runIfDue();
    const timer = window.setInterval(() => void runIfDue(), Math.min(intervalMs, 15 * MINUTE));
    return () => window.clearInterval(timer);
  }, [backupIntervalHours, connectionStatus, lastScheduledBackupAt, mockMode, serverBaseUrl, setScheduledBackupResult]);
}
