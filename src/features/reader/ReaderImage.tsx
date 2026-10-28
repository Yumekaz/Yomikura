import { useState, useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { FitMode, ImageFilters, useSettingsStore } from "../../stores/useSettingsStore";
import { useReaderImageSource } from "./useReaderImageSource";
import { useImageLayout } from "./useImageLayout";

interface ReaderImageProps {
  url: string;
  fallbackUrl?: string;
  pageNumber: number;
  onIntersect?: (pageIndex: number) => void;
  onVisibilityChange?: (pageIndex: number, visible: boolean) => void;
  onReadyChange?: (ready: boolean) => void;
  onLoadStateChange?: (state: "loading" | "ready" | "error" | "unmounted") => void;
  mode?: "webtoon" | "single";
  fitMode?: FitMode;
  imageFilters?: ImageFilters;
  cropBorders?: boolean;
  splitHalf?: 0 | 1;
  rtl?: boolean;
  onDimensions?: (width: number, height: number) => void;
  onPageActions?: () => void;
}

export function ReaderImage({
  url,
  fallbackUrl,
  pageNumber,
  onIntersect,
  onVisibilityChange,
  onReadyChange,
  onLoadStateChange,
  mode = "webtoon",
  fitMode = "FIT_SCREEN",
  imageFilters: imageFiltersProp,
  cropBorders: cropBordersProp,
  splitHalf,
  rtl = false,
  onDimensions,
  onPageActions,
}: ReaderImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number }>();
  const longPressUntil = useRef(0);
  const instanceId = useId();
  const [loadedUrl, setLoadedUrl] = useState("");
  const [error, setError] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({ onIntersect, onVisibilityChange, onReadyChange, onLoadStateChange });
  callbacks.current = { onIntersect, onVisibilityChange, onReadyChange, onLoadStateChange };

  const { imageFilters: storeFilters, cropBorders: storeCrop, experience, reducedMotion } = useSettingsStore();
  const imageFilters = imageFiltersProp ?? storeFilters;
  const cropBorders = cropBordersProp ?? storeCrop;

  const imageUrl = usingFallback && fallbackUrl ? fallbackUrl : url;
  const { url: displayUrl, reload } = useReaderImageSource(imageUrl);
  const loaded = !!displayUrl && loadedUrl === displayUrl && !error;
  const geometry = useImageLayout({ url: displayUrl, container: containerRef, image: imageRef, mode, fit: fitMode, crop: cropBorders, preferences: experience.reader, half: splitHalf, rtl });
  const layout = geometry.layout;
  const observesVisibility = !!(onIntersect || onVisibilityChange);

  useEffect(() => {
    clearTimeout(longPress.current?.timer);
    setLoadedUrl("");
    setError(false);
    setUsingFallback(false);
    setRetryCount(0);
    return () => { clearTimeout(retryTimer.current); clearTimeout(longPress.current?.timer); };
  }, [url, fallbackUrl]);

  useEffect(() => {
    const publish = callbacks.current.onReadyChange;
    publish?.(loaded);
    return () => publish?.(false);
  }, [loaded, imageUrl]);

  useEffect(() => {
    const publish = callbacks.current.onLoadStateChange;
    publish?.(error ? "error" : loaded ? "ready" : "loading");
    return () => publish?.("unmounted");
  }, [loaded, error, imageUrl]);

  useEffect(() => {
    if (!observesVisibility) return;
    // Streamed chapters restart page numbers. Observe this instance's element,
    // never a document-wide lookup that could select another chapter's page.
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0].isIntersecting;
        if (visible) callbacks.current.onIntersect?.(pageNumber);
        callbacks.current.onVisibilityChange?.(pageNumber, visible);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    const onHidden = callbacks.current.onVisibilityChange;
    return () => {
      observer.disconnect();
      onHidden?.(pageNumber, false);
    };
  }, [pageNumber, observesVisibility, url]);

  const handleError = () => {
    if (!usingFallback && fallbackUrl && fallbackUrl !== url) {
      setLoadedUrl("");
      setUsingFallback(true);
      setRetryCount(0);
      return;
    }

    if (retryCount < 3) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setLoadedUrl("");
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(reload, Math.pow(2, nextRetry) * 500);
      return;
    }

    setError(true);
  };

  const handleRetry = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setLoadedUrl("");
    setError(false);
    setUsingFallback(false);
    setRetryCount(0);
    clearTimeout(retryTimer.current);
    reload();
  };

  // Determine classes based on mode and fitMode
  const containerClass = mode === "webtoon"
    ? "relative flex w-full flex-col items-center justify-center bg-black min-h-[50vh] overflow-hidden"
    : `relative flex w-full flex-col items-center justify-center bg-black overflow-hidden ${
        fitMode === "FIT_WIDTH" ? "h-auto min-h-screen py-2" : "h-screen"
      }`;

  let imageClass = "object-contain transition-opacity duration-300";
  if (mode === "webtoon") {
    imageClass += " w-full max-w-4xl";
  } else {
    if (fitMode === "FIT_WIDTH") {
      imageClass += " w-full h-auto max-w-[800px] mx-auto";
    } else if (fitMode === "FIT_HEIGHT") {
      imageClass += " h-screen w-auto";
    } else {
      // FIT_SCREEN
      imageClass += " max-h-full max-w-full";
    }
  }

  const filterStyle = `grayscale(${imageFilters.grayscale}%) invert(${imageFilters.invert}%) brightness(${imageFilters.brightness}%) contrast(${imageFilters.contrast}%)`;

  return (
    <div
      ref={containerRef}
      id={`reader-page-${instanceId}`}
      className={containerClass}
      style={{ backgroundColor: "var(--reader-background, #000)", minHeight: mode === "webtoon" && layout ? 0 : undefined, touchAction: geometry.zoom !== 1 ? "none" : "pan-y" }}
      data-border-crop={geometry.cropState}
      data-image-zoom={geometry.zoom.toFixed(2)}
      data-reader-half={splitHalf === undefined ? "full" : String(splitHalf)}
      onDoubleClick={geometry.doubleClick}
      onContextMenu={(event) => { if (experience.reader.pageActions && onPageActions) { event.preventDefault(); event.stopPropagation(); onPageActions(); } }}
      onPointerDown={(event) => { geometry.pointerDown(event); if (!event.defaultPrevented && event.pointerType === "touch" && experience.reader.pageActions && onPageActions) { const x = event.clientX, y = event.clientY; longPress.current = { x, y, timer: setTimeout(() => { longPressUntil.current = Date.now() + 600; onPageActions(); }, 550) }; } }}
      onPointerMove={(event) => { geometry.pointerMove(event); if (longPress.current && Math.abs(event.clientX - longPress.current.x) + Math.abs(event.clientY - longPress.current.y) > 10) clearTimeout(longPress.current.timer); }}
      onPointerUp={() => { geometry.pointerUp(); clearTimeout(longPress.current?.timer); }}
      onPointerCancel={() => { geometry.pointerUp(); clearTimeout(longPress.current?.timer); }}
      onClickCapture={(event) => { if ((event.target as Element).closest("button,a")) return; if (Date.now() < longPressUntil.current) { event.preventDefault(); event.stopPropagation(); } else geometry.captureClick(event); }}
    >
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--reader-background, #000)" }}>
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center text-slate-500" style={{ backgroundColor: "var(--reader-background, #000)" }}>
          <span>Failed to load page {pageNumber + 1}</span>
          <button onClick={handleRetry} className="mt-2 text-sm text-yomi-jade hover:underline">
            Retry
          </button>
          <a
            className="mt-2 break-all text-xs text-slate-600 hover:text-slate-400"
            href={imageUrl}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            Open image URL
          </a>
          <Link
            to="/settings"
            onClick={(event) => event.stopPropagation()}
            className="mt-2 text-xs text-yomi-jade hover:underline"
          >
            Server Settings
          </Link>
        </div>
      )}
      <div className="yomi-reader-image-viewport w-full" style={layout ? { position: "relative", width: layout.viewportWidth, height: layout.viewportHeight, flexShrink: 0, overflow: "hidden" } : undefined}>
      <div style={layout ? { position: "absolute", left: "50%", top: "50%", width: layout.cropWidth, height: layout.cropHeight, overflow: "hidden", transform: `translate(-50%, -50%) translate(${geometry.pan.x}px, ${geometry.pan.y}px) scale(${geometry.zoom}) rotate(${layout.rotation}deg)`, transition: geometry.dragging || reducedMotion ? "none" : `transform ${experience.reader.zoomAnimationMs}ms ease-out`, willChange: geometry.dragging ? "transform" : undefined } : undefined}>
      <img ref={imageRef}
        src={displayUrl || undefined}
        alt={`Page ${pageNumber + 1}`}
        className={`${layout ? "block object-contain transition-opacity duration-150" : imageClass} ${loaded ? "opacity-100" : "opacity-0"}`}
        draggable={false}
        style={{
          filter: filterStyle,
          ...(layout && geometry.natural ? { position: "absolute", width: geometry.natural.width * layout.scale, height: geometry.natural.height * layout.scale, maxWidth: "none", left: -layout.visible.x * layout.scale, top: -layout.visible.y * layout.scale } as const : {}),
        }}
        onLoad={(event) => { geometry.loaded(event.currentTarget); onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight); setLoadedUrl(displayUrl); }}
        onError={handleError}
      />
      </div></div>
      {geometry.zoom !== 1 && <button type="button" className="yomi-reader-reset-zoom" onClick={(event) => { event.stopPropagation(); geometry.reset(); }}>Fit page</button>}
    </div>
  );
}
