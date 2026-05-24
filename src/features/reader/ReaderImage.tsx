import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { FitMode } from "../../stores/useSettingsStore";

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

  const imageUrl = usingFallback && fallbackUrl ? fallbackUrl : url;

  useEffect(() => {
    setLoaded(false);
    setError(false);
    setUsingFallback(false);
  }, [url, fallbackUrl]);

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
      return;
    }

    setError(true);
  };

  const handleRetry = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setLoaded(false);
    setError(false);
    setUsingFallback(false);
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
      imageClass += " w-full h-auto";
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
        </div>
      )}
      <img
        src={imageUrl}
        alt={`Page ${pageNumber + 1}`}
        className={`${imageClass} ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </div>
  );
}
