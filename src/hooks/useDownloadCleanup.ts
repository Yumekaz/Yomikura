import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProgressBackend } from "./useProgressSynchronization";
import { CLEANUP_CHANGED, runDownloadCleanup } from "../api/suwayomi/downloadCleanup";
import { useDownloadStore } from "../stores/useDownloadStore";
import { useSettingsStore } from "../stores/useSettingsStore";
export function useDownloadCleanup() {
  const backend = useProgressBackend(), client = useQueryClient();
  const hydrated = useSettingsStore((state) => state.hasHydrated);
  useEffect(() => {
    if (!backend || !hydrated) return; let active = true;
    const refresh = () => { if (!active) return; void useDownloadStore.getState().loadCachedChapters().catch(() => undefined); void client.invalidateQueries({ queryKey: ["download-cleanup", backend.key] }); void client.invalidateQueries({ queryKey: ["library"] }); void client.invalidateQueries({ queryKey: ["chapter"] }); };
    const run = () => { void runDownloadCleanup(backend).then(() => { if (active) void client.invalidateQueries({ queryKey: ["download-cleanup", backend.key] }); }).catch(() => undefined); };
    run(); const timer = window.setInterval(run, 30_000); window.addEventListener("online", run); window.addEventListener("focus", run); window.addEventListener(CLEANUP_CHANGED, refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", run); window.removeEventListener("focus", run); window.removeEventListener(CLEANUP_CHANGED, refresh); };
  }, [backend, client, hydrated]);
}
