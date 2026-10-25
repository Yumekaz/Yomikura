import { useState, useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { FitMode, ImageFilters, useSettingsStore } from "../../stores/useSettingsStore";
import { useReaderImageSource } from "./useReaderImageSource";

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
}: ReaderImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [loadedUrl, setLoadedUrl] = useState("");
  const [error, setError] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({ onIntersect, onVisibilityChange, onReadyChange, onLoadStateChange });
  callbacks.current = { onIntersect, onVisibilityChange, onReadyChange, onLoadStateChange };

  const { imageFilters: storeFilters, cropBorders: storeCrop } = useSettingsStore();
  const imageFilters = imageFiltersProp ?? storeFilters;
  const cropBorders = cropBordersProp ?? storeCrop;

  const imageUrl = usingFallback && fallbackUrl ? fallbackUrl : url;
  const { url: displayUrl, reload } = useReaderImageSource(imageUrl);
  const loaded = !!displayUrl && loadedUrl === displayUrl && !error;
  const observesVisibility = !!(onIntersect || onVisibilityChange);

  useEffect(() => {
    setLoadedUrl("");
    setError(false);
    setUsingFallback(false);
    setRetryCount(0);
    return () => clearTimeout(retryTimer.current);
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
    >
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black px-6 text-center text-slate-500">
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
      <img
        src={displayUrl || undefined}
        alt={`Page ${pageNumber + 1}`}
        className={`${imageClass} ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{
          filter: filterStyle,
          transform: cropBorders ? "scale(1.12)" : "none",
          transformOrigin: "center",
          clipPath: cropBorders ? "inset(2% 2% 2% 2%)" : "none",
        }}
        onLoad={() => setLoadedUrl(displayUrl)}
        onError={handleError}
      />
    </div>
  );
}
