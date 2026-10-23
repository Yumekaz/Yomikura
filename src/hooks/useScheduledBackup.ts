import { useEffect, useRef } from "react";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";
import { backupErrorMessage, listLibraryBackups, readLibraryBackup } from "../api/suwayomi/backupStorage";
import { createLibraryBackup } from "../api/suwayomi/libraryBackups";
import { normalizeCacheServerUrl } from "../api/suwayomi/offlineCache";

const MINUTE = 60_000;

export function useScheduledBackup() {
  const running = useRef(new Map<string, Promise<void>>());
  const { backupIntervalHours, connectionStatus, mockMode, serverBaseUrl, setScheduledBackupResult } = useSettingsStore();

  useEffect(() => {
    const server = normalizeCacheServerUrl(serverBaseUrl);
    let active = true;
    const isCurrent = () => active && !useSettingsStore.getState().mockMode && normalizeCacheServerUrl(useSettingsStore.getState().serverBaseUrl) === server;
    setScheduledBackupResult("idle", "", 0);
    if (mockMode || !server) return;
    const intervalMs = backupIntervalHours * 60 * MINUTE;

    const perform = async () => {
      try {
        const latest = (await listLibraryBackups(server)).find((backup) => backup.purpose === "scheduled");
        let savedAt = 0;
        if (latest) {
          try { await readLibraryBackup(server, latest.id); savedAt = latest.createdAt; }
          catch { /* An unreadable file must not postpone a replacement recovery copy. */ }
        }
        if (!isCurrent()) return;
        if (!backupIntervalHours || connectionStatus !== "connected") {
          setScheduledBackupResult("idle", "", savedAt);
          return;
        }
        if (Date.now() - savedAt < intervalMs) {
          setScheduledBackupResult("success", "", savedAt);
          return;
        }
        setScheduledBackupResult("running", "", savedAt);
        const backup = await createLibraryBackup(createGraphqlClient(`${server}/api/graphql`), server, "scheduled");
        if (isCurrent()) setScheduledBackupResult("success", "", backup.createdAt);
      } catch (error) {
        if (isCurrent()) setScheduledBackupResult("error", backupErrorMessage(error));
      }
    };

    const runIfDue = async () => {
      await running.current.get(server);
      if (!isCurrent()) return;
      const job = perform();
      running.current.set(server, job);
      try { await job; }
      finally { if (running.current.get(server) === job) running.current.delete(server); }
    };

    void runIfDue();
    const timer = backupIntervalHours ? window.setInterval(() => void runIfDue(), Math.min(intervalMs, 15 * MINUTE)) : undefined;
    return () => { active = false; window.clearInterval(timer); };
  }, [backupIntervalHours, connectionStatus, mockMode, serverBaseUrl, setScheduledBackupResult]);
}
