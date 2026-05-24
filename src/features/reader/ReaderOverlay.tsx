import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { FitMode, PageSpread, ReaderMode } from "../../stores/useSettingsStore";

interface ReaderOverlayProps {
  show: boolean;
  mangaId: number | undefined;
  chapterName: string;
  mangaTitle: string;
  currentPage: number;
  totalPages: number;
  readerMode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  fitMode: FitMode;
  onFitModeChange: (mode: FitMode) => void;
  pageSpread: PageSpread;
  onPageSpreadChange: (spread: PageSpread) => void;
  nextChapterId?: number;
  prevChapterId?: number;
}

export function ReaderOverlay({
  show,
  mangaId,
  chapterName,
  mangaTitle,
  currentPage,
  totalPages,
  readerMode,
  onModeChange,
  fitMode,
  onFitModeChange,
  pageSpread,
  onPageSpreadChange,
  nextChapterId,
  prevChapterId,
}: ReaderOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between">
      {/* Top Nav */}
      <div className="pointer-events-auto flex items-center justify-between bg-ink-950/90 px-4 py-3 shadow-md backdrop-blur-md transition-transform duration-300 translate-y-0">
        <div className="flex items-center gap-4">
          <Link
            to={mangaId ? `/manga/${mangaId}` : "/library"}
            className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 line-clamp-1">{mangaTitle}</span>
            <span className="text-sm font-semibold text-slate-200 line-clamp-1">{chapterName}</span>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="pointer-events-auto flex flex-col gap-3 bg-ink-950/90 p-4 shadow-md backdrop-blur-md transition-transform duration-300 translate-y-0 pb-safe">
        {/* Progress Text */}
        <div className="flex justify-center text-xs font-semibold text-slate-400">
          {currentPage + 1} / {totalPages}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          {/* Main Navigation Row */}
          <div className="flex items-center justify-between">
            <Link
              to={prevChapterId ? `/reader/${prevChapterId}` : "#"}
              className={`flex items-center gap-1 p-2 text-sm ${prevChapterId ? "text-slate-300 hover:text-white" : "text-slate-600 pointer-events-none"}`}
            >
              <ChevronLeft className="h-5 w-5" /> Prev
            </Link>

            <div className="flex items-center gap-2 rounded-lg bg-ink-900 p-1">
              {(["WEBTOON", "LTR", "RTL"] as ReaderMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onModeChange(mode)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                    readerMode === mode
                      ? "bg-yomi-jade text-ink-950 shadow-sm"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <Link
              to={nextChapterId ? `/reader/${nextChapterId}` : "#"}
              className={`flex items-center gap-1 p-2 text-sm ${nextChapterId ? "text-slate-300 hover:text-white" : "text-slate-600 pointer-events-none"}`}
            >
              Next <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          {/* Conditional Fit / Layout Control Row */}
          {readerMode !== "WEBTOON" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/5 pt-3">
              {/* Scale / Fit Group */}
              <div className="flex items-center justify-between sm:justify-start gap-4">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Scale</span>
                <div className="flex items-center gap-1 rounded-lg bg-ink-900 p-0.5">
                  {(["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"] as FitMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onFitModeChange(mode)}
                      className={`rounded px-2.5 py-1 text-[10px] font-bold transition uppercase ${
                        fitMode === mode
                          ? "bg-yomi-jade text-ink-950 shadow-sm"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      {mode === "FIT_SCREEN" ? "Screen" : mode === "FIT_WIDTH" ? "Width" : "Height"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout / Spread Group */}
              <div className="flex items-center justify-between sm:justify-end gap-4">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Layout</span>
                <div className="flex items-center gap-1 rounded-lg bg-ink-900 p-0.5">
                  {(["SINGLE", "DOUBLE", "DOUBLE_COVER"] as PageSpread[]).map((spread) => (
                    <button
                      key={spread}
                      onClick={() => onPageSpreadChange(spread)}
                      className={`rounded px-2.5 py-1 text-[10px] font-bold transition uppercase ${
                        pageSpread === spread
                          ? "bg-yomi-jade text-ink-950 shadow-sm"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    >
                      {spread === "SINGLE" ? "Single" : spread === "DOUBLE" ? "Double" : "Spread"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
