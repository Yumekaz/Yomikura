import { useCallback, useEffect, useState } from "react";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { getOwnedCachedPage, getOwnedCachedPageTiles, normalizeCacheServerUrl } from "../../api/suwayomi/offlineCache";
export type ReaderTiles = { width: number; height: number; tiles: { url: string; height: number }[] };

/** Resolve full pages and previews through the same device cache. */
export function useReaderImageSource(source: string) {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const scope = JSON.stringify([normalizeCacheServerUrl(serverBaseUrl), mockMode]);
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<{ source: string; scope: string; attempt: number; url: string; tiles?: ReaderTiles }>({ source: "", scope: "", attempt: -1, url: "" });
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    const publish = (url: string, tiles?: ReaderTiles) => {
      if (active) setResolved({ source, scope, attempt, url, tiles });
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
        const [match, tiles] = await Promise.all([getOwnedCachedPage(source, serverBaseUrl, mockMode), getOwnedCachedPageTiles(source, serverBaseUrl, mockMode)]);
        if (match) {
          const blob = await match.blob();
          if (active) {
            const objectUrl = URL.createObjectURL(blob); objectUrls.push(objectUrl);
            let view: ReaderTiles | undefined;
            if (tiles && tiles.width > 0 && tiles.height > 0 && tiles.tiles.length > 1 && tiles.tiles.every((tile) => tile.height > 0) && tiles.tiles.reduce((sum, tile) => sum + tile.height, 0) === tiles.height) {
              try {
                const cache = await caches.open("yomikura-page-cache"), parts = [];
                for (const tile of tiles.tiles) {
                  const response = await cache.match(tile.url); if (!response) throw new Error("A tile is missing");
                  const value = await response.blob(); if (!active) return;
                  const url = URL.createObjectURL(value); objectUrls.push(url); parts.push({ url, height: tile.height });
                }
                view = { width: tiles.width, height: tiles.height, tiles: parts };
              } catch { /* The complete original remains available if optional tiles are missing. */ }
            }
            publish(objectUrl, view);
          }
          return;
        }
      } catch { /* An online page can still work when device storage is unavailable. */ }
      publish(source);
    })();
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [source, scope, attempt]);

  const current = resolved.source === source && resolved.scope === scope && resolved.attempt === attempt;
  return { url: current ? resolved.url : "", tiles: current ? resolved.tiles : undefined, reload };
}
