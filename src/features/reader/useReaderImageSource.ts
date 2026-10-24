import { useCallback, useEffect, useState } from "react";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { getOwnedCachedPage, normalizeCacheServerUrl } from "../../api/suwayomi/offlineCache";

/** Resolve full pages and previews through the same device cache. */
export function useReaderImageSource(source: string) {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const scope = JSON.stringify([normalizeCacheServerUrl(serverBaseUrl), mockMode]);
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState({ source: "", scope: "", attempt: -1, url: "" });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const publish = (url: string) => {
      if (active) setResolved({ source, scope, attempt, url });
    };
    void (async () => {
      if (!source) return publish("");
      if (isTauri() && (source.startsWith("file:") || source.includes(":\\") || source.startsWith("/"))) {
        try {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          publish(convertFileSrc(source));
          return;
        } catch { /* Continue through the normal page/cache path. */ }
      }
      try {
        const match = await getOwnedCachedPage(source, serverBaseUrl, mockMode);
        if (match) {
          const blob = await match.blob();
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            publish(objectUrl);
          }
          return;
        }
      } catch { /* An online page can still work when device storage is unavailable. */ }
      publish(source);
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, scope, attempt]);

  return { url: resolved.source === source && resolved.scope === scope && resolved.attempt === attempt ? resolved.url : "", reload };
}
