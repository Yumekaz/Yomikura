import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { FitMode, isTauri } from "../../stores/useSettingsStore";

interface ReaderImageProps {
  url: string;
  fallbackUrl?: string;
  pageNumber: number;
  onIntersect?: (pageIndex: number) => void;
  mode?: "webtoon" | "single";
  fitMode?: FitMode;
}

export function ReaderImage({ url, fallbackUrl, pageNumber, onIntersect, mode = "webtoon", fitMode = "FIT_SCREEN" }: ReaderImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const imageUrl = usingFallback && fallbackUrl ? fallbackUrl : url;
  const [displayUrl, setDisplayUrl] = useState("");

  useEffect(() => {
    setLoaded(false);
    setError(false);
    setUsingFallback(false);
    setRetryCount(0);
  }, [url, fallbackUrl]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function resolveImage() {
      if (isTauri() && (imageUrl.startsWith("file:") || imageUrl.includes(":\\") || imageUrl.startsWith("/"))) {
        try {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          if (active) {
            setDisplayUrl(convertFileSrc(imageUrl));
            return;
          }
        } catch (e) {
          console.warn("Failed to convert file src:", e);
        }
      }

      try {
        const cache = await caches.open("yomikura-page-cache");
        const match = await cache.match(imageUrl);
        if (match) {
          const blob = await match.blob();
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setDisplayUrl(objectUrl);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to check cache:", e);
      }

      if (active) {
        setDisplayUrl(imageUrl);
      }
    }

    void resolveImage();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!onIntersect) return;
    const el = document.getElementById(`reader-page-${pageNumber}`);
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onIntersect(pageNumber);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onIntersect]);

  const handleError = () => {
    if (!usingFallback && fallbackUrl && fallbackUrl !== url) {
      setLoaded(false);
      setUsingFallback(true);
      setRetryCount(0);
      return;
    }

    if (retryCount < 3) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      setLoaded(false);
      const currentUrl = displayUrl;
      setDisplayUrl("");
      setTimeout(() => {
        setDisplayUrl(currentUrl);
      }, Math.pow(2, nextRetry) * 500);
      return;
    }

    setError(true);
  };

  const handleRetry = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setLoaded(false);
    setError(false);
    setUsingFallback(false);
    setRetryCount(0);
    const currentUrl = displayUrl;
    setDisplayUrl("");
    setTimeout(() => {
      setDisplayUrl(currentUrl);
    }, 10);
  };

  // Determine classes based on mode and fitMode
  const containerClass = mode === "webtoon"
    ? "relative flex w-full flex-col items-center justify-center bg-black min-h-[50vh]"
    : `relative flex w-full flex-col items-center justify-center bg-black ${
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

  return (
    <div
      id={`reader-page-${pageNumber}`}
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
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </div>
  );
}
