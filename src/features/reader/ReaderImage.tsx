import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ReaderImageProps {
  url: string;
  pageNumber: number;
  serverBaseUrl: string;
  onIntersect?: (pageIndex: number) => void;
}

export function ReaderImage({ url, pageNumber, serverBaseUrl, onIntersect }: ReaderImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Safely format URL
  const imageUrl = url.startsWith("http")
    ? url
    : `${serverBaseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;

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

  return (
    <div id={`reader-page-${pageNumber}`} className="relative flex min-h-[50vh] w-full flex-col items-center justify-center bg-black">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
          <span>Failed to load page {pageNumber + 1}</span>
          <button onClick={() => setError(false)} className="mt-2 text-sm text-yomi-jade hover:underline">
            Retry
          </button>
        </div>
      )}
      <img
        src={imageUrl}
        alt={`Page ${pageNumber + 1}`}
        className={`w-full max-w-4xl object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}
