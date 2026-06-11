import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Sliders, Settings, Play, Pause, Eye, BookOpen, RefreshCw } from "lucide-react";
import { FitMode, PageSpread, ReaderMode, useSettingsStore } from "../../stores/useSettingsStore";

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
  hasOverride: boolean;
  onToggleOverride: () => void;
  buildPageUrl: (pageIndex: number) => string;
  onJumpToPage: (pageIndex: number) => void;
  isAutoScrolling: boolean;
  onToggleAutoScroll: () => void;
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
  hasOverride,
  onToggleOverride,
  buildPageUrl,
  onJumpToPage,
  isAutoScrolling,
  onToggleAutoScroll,
}: ReaderOverlayProps) {
  const [activeSubTab, setActiveSubTab] = useState<"layout" | "filters" | "scroll" | "none">("none");

  const {
    imageFilters,
    setImageFilters,
    cropBorders,
    setCropBorders,
    autoScrollSpeed,
    setAutoScrollSpeed,
    pageTransition,
    setPageTransition,
    autoDownloadCount,
    setAutoDownloadCount,
  } = useSettingsStore();

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between select-none">
      {/* Top Nav */}
      <div className="pointer-events-auto flex items-center justify-between bg-ink-950/90 px-4 py-3 shadow-md backdrop-blur-md transition-transform duration-300 translate-y-0 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link
            to={mangaId ? `/manga/${mangaId}` : "/library"}
            className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs text-slate-400 line-clamp-1">{mangaTitle}</span>
            <span className="text-xs sm:text-sm font-semibold text-slate-200 line-clamp-1">{chapterName}</span>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="pointer-events-auto flex flex-col gap-3 bg-ink-950/90 p-4 shadow-md backdrop-blur-md transition-transform duration-300 translate-y-0 pb-safe border-t border-white/5">
        
        {/* Sub-tab panels */}
        {activeSubTab !== "none" && (
          <div className="rounded-xl bg-ink-900/80 p-4 border border-white/5 backdrop-blur-md mb-2 flex flex-col gap-4 animate-fade-in">
            
            {/* 1. LAYOUT CONTROLS */}
            {activeSubTab === "layout" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Reading Direction</span>
                  <div className="flex items-center gap-1 rounded-lg bg-ink-950 p-1">
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
                </div>

                {readerMode !== "WEBTOON" && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Page Scaling</span>
                      <div className="flex items-center gap-1 rounded-lg bg-ink-950 p-1">
                        {(["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"] as FitMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => onFitModeChange(mode)}
                            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
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

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">Page Spread</span>
                      <div className="flex items-center gap-1 rounded-lg bg-ink-950 p-1">
                        {(["SINGLE", "DOUBLE", "DOUBLE_COVER"] as PageSpread[]).map((spread) => (
                          <button
                            key={spread}
                            onClick={() => onPageSpreadChange(spread)}
                            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
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
                  </>
                )}

                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-xs font-semibold text-slate-300">Page transition</span>
                  <select
                    value={pageTransition}
                    onChange={(e) => setPageTransition(e.target.value as "fade" | "slide" | "none")}
                    className="rounded bg-ink-950 border border-white/10 px-2 py-1 text-xs text-slate-300"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Auto-download ahead</span>
                  <select
                    value={autoDownloadCount}
                    onChange={(e) => setAutoDownloadCount(parseInt(e.target.value, 10))}
                    className="rounded bg-ink-950 border border-white/10 px-2 py-1 text-xs text-slate-300"
                  >
                    <option value={0}>Off</option>
                    <option value={1}>1</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                  </select>
                </div>

                {/* Overrides Toggle */}
                {mangaId !== undefined && (
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-300">Remember for this manga</span>
                      <span className="text-[10px] text-slate-500">Save custom reader configuration overrides</span>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleOverride}
                      className={`relative inline-flex h-5.5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        hasOverride ? "bg-yomi-jade" : "bg-ink-950 border-white/10"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          hasOverride ? "translate-x-4.5 bg-ink-950" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. IMAGE FILTERS & CROP */}
            {activeSubTab === "filters" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Crop White Borders</span>
                  <button
                    type="button"
                    onClick={() => setCropBorders(!cropBorders)}
                    className={`relative inline-flex h-5.5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      cropBorders ? "bg-yomi-jade" : "bg-ink-950 border-white/10"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        cropBorders ? "translate-x-4.5 bg-ink-950" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Grayscale Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Grayscale Effect</span>
                    <span>{imageFilters.grayscale}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageFilters.grayscale}
                    onChange={(e) => setImageFilters({ grayscale: parseInt(e.target.value) })}
                    className="w-full h-1 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-yomi-jade"
                  />
                </div>

                {/* Inversion Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Invert Colors</span>
                    <span>{imageFilters.invert}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageFilters.invert}
                    onChange={(e) => setImageFilters({ invert: parseInt(e.target.value) })}
                    className="w-full h-1 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-yomi-jade"
                  />
                </div>

                {/* Brightness Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Brightness Adjust</span>
                    <span>{imageFilters.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={imageFilters.brightness}
                    onChange={(e) => setImageFilters({ brightness: parseInt(e.target.value) })}
                    className="w-full h-1 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-yomi-jade"
                  />
                </div>

                {/* Contrast Slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Contrast Adjust</span>
                    <span>{imageFilters.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={imageFilters.contrast}
                    onChange={(e) => setImageFilters({ contrast: parseInt(e.target.value) })}
                    className="w-full h-1 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-yomi-jade"
                  />
                </div>
              </div>
            )}

            {/* 3. AUTO-SCROLL CONTROLS */}
            {activeSubTab === "scroll" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-300">Auto-Scroll Mode</span>
                    <span className="text-[10px] text-slate-500">Only active in vertical webtoon mode</span>
                  </div>
                  <button
                    onClick={() => {
                      if (readerMode !== "WEBTOON") onModeChange("WEBTOON");
                      onToggleAutoScroll();
                    }}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${
                      isAutoScrolling
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-yomi-jade text-ink-950"
                    }`}
                  >
                    {isAutoScrolling ? (
                      <>
                        <Pause className="h-4 w-4 fill-current" />
                        Pause Scroll
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        Start Scroll
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Scrolling Speed</span>
                    <span>{autoScrollSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={autoScrollSpeed}
                    onChange={(e) => setAutoScrollSpeed(parseInt(e.target.value))}
                    className="w-full h-1 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-yomi-jade"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Thumbnail Page Navigator Dock */}
        {totalPages > 0 && (
          <div className="flex flex-col gap-1 border-b border-white/5 pb-2">
            <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const isCurrent = idx === currentPage;
                return (
                  <button
                    key={idx}
                    onClick={() => onJumpToPage(idx)}
                    className={`relative h-14 w-10 flex-shrink-0 overflow-hidden rounded border transition-all duration-200 ${
                      isCurrent
                        ? "border-yomi-jade ring-1 ring-yomi-jade scale-105"
                        : "border-white/5 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={buildPageUrl(idx)}
                      alt={`Page ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/75 py-0.2 text-[7px] font-black text-slate-300 text-center">
                      {idx + 1}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress Text & Settings Tabs Row */}
        <div className="flex items-center justify-between">
          
          {/* Sibling Chapters navigation */}
          <Link
            to={prevChapterId ? `/reader/${prevChapterId}` : "#"}
            className={`flex items-center gap-1 p-2 text-xs font-semibold ${prevChapterId ? "text-slate-300 hover:text-white" : "text-slate-600 pointer-events-none"}`}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Link>

          {/* Sub-tab Switchers Group */}
          <div className="flex items-center gap-1 rounded-lg bg-ink-900 p-0.5 border border-white/5">
            <button
              onClick={() => setActiveSubTab(activeSubTab === "layout" ? "none" : "layout")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition uppercase flex items-center gap-1 ${
                activeSubTab === "layout" ? "bg-yomi-jade text-ink-950 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BookOpen className="h-3 w-3" />
              Layout
            </button>
            <button
              onClick={() => setActiveSubTab(activeSubTab === "filters" ? "none" : "filters")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition uppercase flex items-center gap-1 ${
                activeSubTab === "filters" ? "bg-yomi-jade text-ink-950 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sliders className="h-3 w-3" />
              Filters
            </button>
            <button
              onClick={() => setActiveSubTab(activeSubTab === "scroll" ? "none" : "scroll")}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition uppercase flex items-center gap-1 ${
                activeSubTab === "scroll" ? "bg-yomi-jade text-ink-950 shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Play className="h-3 w-3" />
              Scroll
            </button>
          </div>

          <Link
            to={nextChapterId ? `/reader/${nextChapterId}` : "#"}
            className={`flex items-center gap-1 p-2 text-xs font-semibold ${nextChapterId ? "text-slate-300 hover:text-white" : "text-slate-600 pointer-events-none"}`}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Bottom Status bar */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold px-1 mt-1 border-t border-white/5 pt-2">
          <span>{currentPage + 1} of {totalPages} pages</span>
          <span>{readerMode} Mode</span>
        </div>
      </div>
    </div>
  );
}
