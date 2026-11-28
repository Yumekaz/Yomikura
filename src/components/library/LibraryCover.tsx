import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { metadataScope, readCover, saveCover } from "../../api/suwayomi/libraryMetadata";
import { assertLibrarySession } from "../../api/suwayomi/librarySession";
import { isProtectedLibraryImage, protectedImage, useDesktopAuthRevision } from "../../api/suwayomi/desktopAuth";
import { useVisibleImage } from "../../hooks/useVisibleImage";

/** Cache only covers actually viewed; page availability is managed separately. */
export function LibraryCover({ src, onError, loading, cache = true, ...props }: ImgHTMLAttributes<HTMLImageElement> & { cache?: boolean }) {
  const { serverBaseUrl, mockMode, connectionStatus } = useSettingsStore();
  const revision = useDesktopAuthRevision();
  const protectedSource = !!src && !mockMode && isProtectedLibraryImage(src, serverBaseUrl);
  const { ref, ready } = useVisibleImage(protectedSource && loading === "lazy");
  let scope: string | undefined;
  try { scope = !cache || mockMode ? undefined : metadataScope(serverBaseUrl); } catch { /* Invalid profiles remain editable. */ }
  const [saved, setSaved] = useState<{ identity: string; url: string }>();
  const [live, setLive] = useState<{ identity: string; url: string }>();
  const [failed, setFailed] = useState<string>();
  const identity = JSON.stringify([serverBaseUrl, scope, src, revision, connectionStatus]);
  useEffect(() => {
    if (!src || !ready || (!scope && !protectedSource) || /^(?:blob:|data:|\/?placeholder)/.test(src)) return;
    const objectUrls: string[] = [];
    const abort = new AbortController();
    const publish = (blob: Blob, set: typeof setSaved) => {
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      set({ identity, url });
    };
    void (async () => {
      const stored = await readCover(scope, src);
      if (stored) publish(stored, setSaved);
      if (connectionStatus !== "connected" || abort.signal.aborted) return;
      try {
        let blob: Blob | undefined;
        if (protectedSource) {
          blob = await protectedImage(src, serverBaseUrl, abort.signal);
          if (blob) publish(blob, setLive);
        } else {
          const response = await fetch(src, { signal: abort.signal });
          if (response.ok && response.headers.get("content-type")?.startsWith("image/")) blob = await response.blob();
        }
        if (!blob || !scope || abort.signal.aborted) return;
        await assertLibrarySession(serverBaseUrl, JSON.parse(scope)[1]);
        if (!abort.signal.aborted) await saveCover(scope, src, blob);
      } catch {
        if (protectedSource && !abort.signal.aborted) setFailed(identity);
      }
    })();
    return () => { abort.abort(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [src, scope, identity, serverBaseUrl, connectionStatus, protectedSource, ready]);
  const stored = saved?.identity === identity ? saved.url : undefined;
  const displayed = failed === identity ? stored ?? "placeholder-cover.svg" : protectedSource
    ? (live?.identity === identity ? live.url : stored)
    : connectionStatus !== "connected" ? stored ?? src : src;
  return <img ref={ref} draggable={false} {...props} loading={loading} src={displayed} onError={(event) => { if (cache) setFailed(identity); onError?.(event); }} />;
}
