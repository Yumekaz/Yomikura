import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ReaderImageProps {
  url: string;
  fallbackUrl?: string;
  pageNumber: number;
  onIntersect?: (pageIndex: number) => void;
  mode?: "webtoon" | "single";
}

export function ReaderImage({ url, fallbackUrl, pageNumber, onIntersect, mode = "webtoon" }: ReaderImageProps) {
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

  return (
    <div
      id={`reader-page-${pageNumber}`}
      className={`relative flex w-full flex-col items-center justify-center bg-black ${
        mode === "webtoon" ? "min-h-[50vh]" : "h-screen"
      }`}
    >
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center text-slate-500">
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
        className={`${
          mode === "webtoon" ? "w-full max-w-4xl" : "max-h-full max-w-full"
        } object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={handleError}
      />
    </div>
  );
}
