import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { metadataScope, readCover, saveCover } from "../../api/suwayomi/libraryMetadata";
import { assertLibrarySession } from "../../api/suwayomi/librarySession";

/** Cache only covers actually viewed; page availability is managed separately. */
export function LibraryCover({ src, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const { serverBaseUrl, mockMode, connectionStatus } = useSettingsStore();
  let scope: string | undefined;
  try { scope = mockMode ? undefined : metadataScope(serverBaseUrl); } catch { /* Invalid profiles remain editable. */ }
  const [saved, setSaved] = useState<{ source: string; scope: string; url: string }>();
  const [failed, setFailed] = useState<string>();
  const identity = JSON.stringify([scope, src]);
  useEffect(() => {
    if (!src || !scope || src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/placeholder")) return;
    let active = true, objectUrl: string | undefined;
    const abort = new AbortController();
    const useSaved = async () => {
      const blob = await readCover(scope, src);
      if (blob && active) { objectUrl = URL.createObjectURL(blob); setSaved({ source: src, scope, url: objectUrl }); }
    };
    void (async () => {
      await useSaved();
      if (connectionStatus !== "connected" || !active) return;
      try {
        const response = await fetch(src, { signal: abort.signal });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return;
        const blob = await response.blob();
        if (active) {
          await assertLibrarySession(serverBaseUrl, JSON.parse(scope)[1]);
          if (active) { await saveCover(scope, src, blob); if (active) setFailed(undefined); }
        }
      } catch { /* A cover failure never blocks navigation or saved reading. */ }
    })();
    return () => { active = false; abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, scope, connectionStatus]);
  const stored = saved && saved.source === src && saved.scope === scope ? saved.url : undefined;
  return <img {...props} src={(connectionStatus !== "connected" || failed === identity) && stored ? stored : failed === identity ? "/placeholder-cover.svg" : src} onError={(event) => { setFailed(identity); onError?.(event); }} />;
}
