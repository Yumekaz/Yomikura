import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../stores/useSettingsStore";
import { progressBackend } from "../api/suwayomi/backendIdentity";
import { PROGRESS_CHANGED_EVENT } from "../api/suwayomi/progressStorage";
import { synchronizeProgress } from "../api/suwayomi/progressSync";
import { invalidateChapterState } from "../api/suwayomi/chapterState";
import { useDownloadStore } from "../stores/useDownloadStore";

export function useProgressBackend() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  return useMemo(() => {
    try { return progressBackend(serverBaseUrl, mockMode); } catch { return null; }
  }, [serverBaseUrl, mockMode]);
}

export function useProgressSynchronization() {
  const backend = useProgressBackend();
  const client = useQueryClient();
  const hydrated = useSettingsStore((state) => state.hasHydrated);
  useEffect(() => {
    if (!backend || !hydrated) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (!active) return;
      const settings = useSettingsStore.getState();
      if (!backend.isDemo && settings.connectionStatus === "error") void settings.testConnection();
      void synchronizeProgress(backend).catch(() => undefined);
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ backendKey: string; kind: string }>).detail;
      if (detail?.backendKey !== backend.key) return;
      void client.invalidateQueries({ queryKey: ["progress-sync", backend.key] });
      void client.invalidateQueries({ queryKey: ["history", "local", backend.serverBaseUrl] });
      if (detail.kind === "queued") {
        clearTimeout(debounce);
        debounce = setTimeout(run, 750);
      } else if (detail.kind === "changed") {
        void invalidateChapterState(client);
        void useDownloadStore.getState().loadCachedChapters?.();
      }
    };
    run();
    const timer = window.setInterval(run, 15_000);
    window.addEventListener(PROGRESS_CHANGED_EVENT, changed);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    return () => {
      active = false;
      clearTimeout(debounce);
      window.clearInterval(timer);
      window.removeEventListener(PROGRESS_CHANGED_EVENT, changed);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
    };
  }, [backend, client, hydrated]);
}
