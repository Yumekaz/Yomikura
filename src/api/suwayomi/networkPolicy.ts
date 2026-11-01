import type { DownloadExperience } from "../../stores/downloadExperience";
export interface ConnectionInformation extends EventTarget { type?: string; saveData?: boolean; effectiveType?: string }
export function connectionInformation(): ConnectionInformation | undefined { return typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: ConnectionInformation }).connection; }
export function isUnmetered(preferences: DownloadExperience, connection = connectionInformation()): boolean {
  if (preferences.connectionCost !== "automatic") return preferences.connectionCost === "unmetered";
  if (connection?.saveData) return false;
  return connection?.type === "wifi" || connection?.type === "ethernet";
}
export function allowDeviceDownload(preferences: DownloadExperience, connection = connectionInformation()): boolean { return !preferences.unmeteredOnly || isUnmetered(preferences, connection); }
export function allowedPreloadPages(preferences: DownloadExperience, connection = connectionInformation()): number { return connection?.saveData || preferences.preloadUnmeteredOnly && !isUnmetered(preferences, connection) ? 0 : preferences.preloadPages; }

export function waitForDownloadNetwork(allowed: () => boolean, subscribe: (listener: () => void) => () => void, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Download cancelled", "AbortError"));
  if (allowed()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const connection = connectionInformation(); let unsubscribe: (() => void) | undefined; let finished = false;
    const clean = () => { finished = true; signal.removeEventListener("abort", aborted); if (typeof window !== "undefined") { window.removeEventListener("online", changed); window.removeEventListener("offline", changed); } connection?.removeEventListener?.("change", changed); unsubscribe?.(); };
    const aborted = () => { clean(); reject(new DOMException("Download cancelled", "AbortError")); };
    const changed = () => { if (finished) return; if (signal.aborted) aborted(); else if (allowed()) { clean(); resolve(); } };
    signal.addEventListener("abort", aborted, { once: true }); if (typeof window !== "undefined") { window.addEventListener("online", changed); window.addEventListener("offline", changed); } connection?.addEventListener?.("change", changed); unsubscribe = subscribe(changed); if (finished) unsubscribe(); else changed();
  });
}
