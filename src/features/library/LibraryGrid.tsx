import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, Compass } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

function findScrollParent(element: HTMLElement): HTMLElement | Window {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflowY}${style.overflow}`)) return current;
    current = current.parentElement;
  }
  return window;
}

export interface LibraryManga {
  id: string | number;
  title: string;
  thumbnailUrl: string | null | undefined;
  unreadCount: number;
  hasStartedReading: boolean;
}

/** The visible tracks and virtual rows must use the same container measurement. */
export function libraryGridLayout(width: number, density: "compact" | "normal" | "spacious") {
  const gap = density === "compact" ? 16 : 24;
  const minimum = density === "compact" ? 116 : density === "spacious" ? 212 : width < 520 ? 128 : 154;
  const columns = Math.max(1, Math.floor((width + gap) / (minimum + gap)));
  const coverWidth = Math.max(1, (width - (columns - 1) * gap) / columns);
  return { columns, gap, rowHeight: coverWidth * 1.5 + 62 + gap };
}

interface LibraryGridProps {
  mangas: LibraryManga[];
  serverBaseUrl: string;
  isSelectMode?: boolean;
  selectedMangaIds?: Set<string | number>;
  onToggleSelectManga?: (id: string | number) => void;
  filtered?: boolean;
  onClearFilters?: () => void;
}

export function LibraryGrid({ mangas, serverBaseUrl, isSelectMode = false, selectedMangaIds = new Set(), onToggleSelectManga, filtered, onClearFilters }: LibraryGridProps) {
  const { coverDensity } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(900);
  const [containerWidth, setContainerWidth] = useState(800);
  const [keyboardAccess, setKeyboardAccess] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setContainerWidth(entry.contentRect.width));
    observer.observe(el);
    const parent = findScrollParent(el);
    const measureScroll = () => {
      const viewportTop = parent instanceof Window ? 0 : parent.getBoundingClientRect().top;
      setScrollTop(Math.max(0, viewportTop - el.getBoundingClientRect().top));
      setContainerHeight(parent instanceof Window ? window.innerHeight : parent.clientHeight);
    };
    parent.addEventListener("scroll", measureScroll, { passive: true });
    window.addEventListener("resize", measureScroll);
    measureScroll();
    return () => { observer.disconnect(); parent.removeEventListener("scroll", measureScroll); window.removeEventListener("resize", measureScroll); };
  }, [mangas.length > 0]);

  const { columns, rowHeight, gap } = libraryGridLayout(containerWidth, coverDensity);
  const totalRows = Math.ceil(mangas.length / columns);
  const startRow = keyboardAccess ? 0 : Math.min(Math.max(0, totalRows - 1), Math.max(0, Math.floor(scrollTop / rowHeight) - 2));
  const endRow = keyboardAccess ? totalRows : Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + 2);
  const visibleMangas = mangas.slice(startRow * columns, endRow * columns);

  if (!mangas.length) return (
    <div className="yomi-route-empty">
      <div>
        <BookOpen aria-hidden="true" />
        <h2>{filtered ? "No books found" : "Your next story starts here"}</h2>
        <p>{filtered ? "Try another search or choose a different collection." : "Find something you love, add it to your library, and make yourself at home."}</p>
        {filtered ? <button className="yomi-button yomi-button-secondary mt-5" onClick={onClearFilters}>Clear filters</button> : <Link to="/browse/sources" className="yomi-button yomi-button-primary mt-5"><Compass />Discover books</Link>}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="yomi-bookshelf" aria-label="Library books" onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) setKeyboardAccess(true); }}>
      <div style={{ height: startRow * rowHeight }} aria-hidden="true" />
      <div className="yomi-book-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}>
        {visibleMangas.map((manga) => {
          const imageUrl = manga.thumbnailUrl ? (manga.thumbnailUrl.startsWith("http") || manga.thumbnailUrl.startsWith("blob:") || manga.thumbnailUrl.startsWith("data:") ? manga.thumbnailUrl : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl}`) : "/placeholder-cover.svg";
          const selected = selectedMangaIds.has(manga.id);
          const body = <>
            <div className={`yomi-book-cover ${selected ? "is-selected" : ""}`}>
              <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={(event) => { if (!event.currentTarget.src.endsWith("/placeholder-cover.svg")) event.currentTarget.src = "/placeholder-cover.svg"; }} />
              {isSelectMode ? <span className={`yomi-book-selection ${selected ? "is-selected" : ""}`}><Check aria-hidden="true" /></span> : manga.unreadCount > 0 && <span className="yomi-unread-badge" aria-label={`${manga.unreadCount} unread chapters`}>{manga.unreadCount}</span>}
            </div>
            <div className="yomi-book-caption">
              <h2 title={manga.title}>{manga.title.replace(/^\[Demo\]\s*/, "")}</h2>
              <p>{manga.unreadCount > 0 ? `${manga.unreadCount} unread chapter${manga.unreadCount === 1 ? "" : "s"}` : manga.hasStartedReading ? "All caught up" : "Ready to read"}</p>
            </div>
          </>;
          return isSelectMode ? <button key={manga.id} type="button" aria-label={manga.title} aria-pressed={selected} onClick={() => onToggleSelectManga?.(manga.id)} className="yomi-book">{body}</button> : <Link key={manga.id} aria-label={manga.title} to={`/manga/${manga.id}`} onContextMenu={(event) => { event.preventDefault(); onToggleSelectManga?.(manga.id); }} className="yomi-book">{body}</Link>;
        })}
      </div>
      <div style={{ height: Math.max(0, (totalRows - endRow) * rowHeight) }} aria-hidden="true" />
    </div>
  );
}
