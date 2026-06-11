import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export interface LibraryManga {
  id: string | number;
  title: string;
  thumbnailUrl: string | null | undefined;
  unreadCount: number;
  /** True when user has opened/read at least one chapter */
  hasStartedReading: boolean;
}

interface LibraryGridProps {
  mangas: LibraryManga[];
  serverBaseUrl: string;
  isSelectMode?: boolean;
  selectedMangaIds?: Set<string | number>;
  onToggleSelectManga?: (id: string | number) => void;
}

export function LibraryGrid({
  mangas,
  serverBaseUrl,
  isSelectMode = false,
  selectedMangaIds = new Set(),
  onToggleSelectManga,
}: LibraryGridProps) {
  const { coverDensity } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Virtualization State
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(800);

  // Resize listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scroll listener on nearest scrollable parent
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const handleScroll = () => {
      setScrollTop(parent.scrollTop);
    };

    const handleResize = () => {
      setContainerHeight(parent.clientHeight);
    };

    parent.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    
    // Measure initially
    setScrollTop(parent.scrollTop);
    setContainerHeight(parent.clientHeight);

    return () => {
      parent.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Compute Grid Config
  const gridConfig = useMemo(() => {
    let cols = 2;
    if (coverDensity === "compact") {
      if (containerWidth >= 1536) cols = 10;
      else if (containerWidth >= 1280) cols = 9;
      else if (containerWidth >= 1024) cols = 7;
      else if (containerWidth >= 768) cols = 5;
      else if (containerWidth >= 640) cols = 4;
      else cols = 3;
    } else if (coverDensity === "spacious") {
      if (containerWidth >= 1536) cols = 6;
      else if (containerWidth >= 1280) cols = 5;
      else if (containerWidth >= 1024) cols = 4;
      else if (containerWidth >= 768) cols = 3;
      else if (containerWidth >= 640) cols = 2;
      else cols = 1;
    } else {
      // normal
      if (containerWidth >= 1536) cols = 7;
      else if (containerWidth >= 1280) cols = 6;
      else if (containerWidth >= 1024) cols = 5;
      else if (containerWidth >= 768) cols = 4;
      else if (containerWidth >= 640) cols = 3;
      else cols = 2;
    }

    const gap = coverDensity === "compact" ? 8 : coverDensity === "spacious" ? 20 : 12;
    const padding = coverDensity === "compact" ? 16 : coverDensity === "spacious" ? 32 : 24;
    const cardWidth = Math.max(50, (containerWidth - (cols - 1) * gap - padding) / cols);
    const cardHeight = cardWidth * 1.5; // aspect ratio 2:3
    
    return { cols, cardHeight, gap };
  }, [containerWidth, coverDensity]);

  if (mangas.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-850 mb-4 text-slate-400">
          <BookOpen className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-medium text-slate-200">Your library is empty</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Add manga to your library from the Browse tab or your Suwayomi server interface.
        </p>
      </div>
    );
  }

  const { cols, cardHeight, gap } = gridConfig;
  const rowHeight = cardHeight + gap;
  const totalRows = Math.ceil(mangas.length / cols);
  const totalHeight = totalRows * rowHeight;

  // Calculate visible range
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 1);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + 1);

  const visibleMangas = mangas.slice(startRow * cols, endRow * cols);
  const topSpacer = startRow * rowHeight;
  const bottomSpacer = Math.max(0, totalHeight - endRow * rowHeight);

  // Dynamic CSS classes for responsive layouts (matches grid configuration cols)
  const gridClasses = 
    coverDensity === "compact"
      ? "grid grid-cols-3 gap-2 p-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 lg:gap-2 lg:p-4"
      : coverDensity === "spacious"
      ? "grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 lg:gap-5 lg:p-8"
      : "grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 lg:gap-3 lg:p-6";

  const titleClasses =
    coverDensity === "compact"
      ? "line-clamp-2 text-[10px] sm:text-xs font-semibold leading-tight text-white drop-shadow-md"
      : coverDensity === "spacious"
      ? "line-clamp-2 text-sm sm:text-base font-semibold leading-snug text-white drop-shadow-md"
      : "line-clamp-2 text-xs font-semibold leading-snug text-white drop-shadow-md sm:text-sm";

  const paddingClasses =
    coverDensity === "compact"
      ? "relative z-20 mt-auto p-1.5"
      : coverDensity === "spacious"
      ? "relative z-20 mt-auto p-4"
      : "relative z-20 mt-auto p-2.5";

  return (
    <div ref={containerRef} className="w-full relative" style={{ height: `${totalHeight}px` }}>
      {/* Top Spacer */}
      <div style={{ height: `${topSpacer}px` }} />

      {/* Visible Grid Items */}
      <div className={gridClasses}>
        {visibleMangas.map((manga, idx) => {
          const absoluteIdx = startRow * cols + idx;
          const isSelected = selectedMangaIds.has(manga.id);
          
          let imageUrl = "/placeholder-cover.svg";
          if (manga.thumbnailUrl) {
            imageUrl = manga.thumbnailUrl.startsWith("http")
              ? manga.thumbnailUrl
              : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`;
          }

          const handleCardClick = (e: React.MouseEvent) => {
            if (isSelectMode && onToggleSelectManga) {
              e.preventDefault();
              onToggleSelectManga(manga.id);
            }
          };

          const handleCardLongPress = (e: React.MouseEvent) => {
            if (!isSelectMode && onToggleSelectManga) {
              e.preventDefault();
              onToggleSelectManga(manga.id);
            }
          };

          const isCaughtUp = manga.unreadCount === 0 && manga.hasStartedReading;

          const CardBody = (
            <>
              {/* Background Image */}
              <div className="absolute inset-0 z-0">
                <img
                  src={imageUrl}
                  alt={manga.title}
                  className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
                    isCaughtUp ? "opacity-45 grayscale-[0.4] saturate-50" : ""
                  }`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                  loading="lazy"
                />
              </div>

              {/* Selection Checkbox Badge */}
              {isSelectMode && (
                <div className={`absolute left-2.5 top-2.5 z-25 flex h-5.5 w-5.5 items-center justify-center rounded-full border shadow backdrop-blur-md transition-all duration-200 ${
                  isSelected 
                    ? "bg-yomi-jade border-yomi-jade text-ink-950 scale-110" 
                    : "bg-black/45 border-white/20 text-transparent"
                }`}>
                  <Check className="h-3.5 w-3.5 stroke-[3.5]" />
                </div>
              )}

              {/* Unread badge */}
              {!isSelectMode && manga.unreadCount > 0 && (
                <div className="absolute -right-1 -top-1 z-20 flex h-5.5 min-w-[22px] items-center justify-center rounded-full bg-yomi-jade px-1.5 text-[9px] font-black text-ink-950 shadow border border-ink-950/20">
                  {manga.unreadCount}
                </div>
              )}

              {/* Gradient overlay */}
              <div className={`absolute inset-0 z-10 bg-gradient-to-t from-black/95 via-black/25 to-transparent transition-opacity duration-300 ${
                isSelected ? "opacity-100 bg-yomi-jade/20 border-2 border-yomi-jade rounded-xl" : "opacity-90 group-hover:opacity-100"
              }`} />
              
              {/* Title */}
              <div className={`${paddingClasses} bg-gradient-to-t from-black/80 via-transparent to-transparent pt-8`}>
                <h4
                  className={`${titleClasses} transition-colors duration-200 ${
                    isCaughtUp
                      ? "text-slate-500 group-hover:text-slate-400"
                      : "group-hover:text-yomi-mint"
                  }`}
                >
                  {manga.title}
                </h4>
              </div>
            </>
          );

          if (isSelectMode) {
            return (
              <button
                key={manga.id}
                onClick={handleCardClick}
                className={`group relative flex w-full flex-col overflow-hidden rounded-xl bg-ink-850 border card-lift shadow-md text-left ${
                  isSelected ? "border-yomi-jade shadow-glow" : "border-white/5"
                }`}
                style={{ height: `${cardHeight}px` }}
              >
                {CardBody}
              </button>
            );
          }

          return (
            <Link
              key={manga.id}
              to={`/manga/${manga.id}`}
              onContextMenu={handleCardLongPress}
              className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-ink-850 border border-white/5 card-lift shadow-md"
              style={{ height: `${cardHeight}px` }}
            >
              {CardBody}
            </Link>
          );
        })}
      </div>

      {/* Bottom Spacer */}
      <div style={{ height: `${bottomSpacer}px` }} />
    </div>
  );
}
