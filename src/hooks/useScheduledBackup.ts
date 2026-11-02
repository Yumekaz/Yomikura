import { useEffect, useRef } from "react";
import { createGraphqlClient } from "../api/graphql/client";
import { useSettingsStore } from "../stores/useSettingsStore";
import { backupErrorMessage, listLibraryBackups, readLibraryBackup } from "../api/suwayomi/backupStorage";
import { createLibraryBackup } from "../api/suwayomi/libraryBackups";
import { normalizeCacheServerUrl } from "../api/suwayomi/offlineCache";
import { establishLibraryIdentity, verifyLibraryIdentity } from "../api/suwayomi/libraryIdentity";

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
        if (!backupIntervalHours || connectionStatus !== "connected") return;
        const identity = await establishLibraryIdentity(server);
        const latest = (await listLibraryBackups(server)).find((backup) => backup.purpose === "scheduled" && backup.libraryId === identity.marker);
        let savedAt = 0;
        if (latest) {
          try {
            const retained = await readLibraryBackup(server, latest.id);
            await verifyLibraryIdentity(server, identity);
            if (retained.backup.libraryId === identity.marker) savedAt = retained.backup.createdAt;
          }
          catch { /* An unreadable file must not postpone a replacement recovery copy. */ }
        }
        if (!isCurrent()) return;
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
