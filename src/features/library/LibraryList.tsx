import { BookOpen, Check, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import type { LibraryManga } from "./LibraryGrid";

export function LibraryList({ mangas, serverBaseUrl, isSelectMode, selectedMangaIds, onToggleSelectManga }: { mangas: LibraryManga[]; serverBaseUrl: string; isSelectMode: boolean; selectedMangaIds: Set<string | number>; onToggleSelectManga: (id: string | number) => void }) {
  if (!mangas.length) return <div className="yomi-route-empty"><div><BookOpen /><h2>Your library is empty</h2><p>Build a local collection by adding a title from one of your installed sources.</p><Link to="/browse" className="yomi-button yomi-button-primary mt-5"><Compass />Browse sources</Link></div></div>;
  return (
    <div className="yomi-surface overflow-hidden">
      {mangas.map((manga) => {
        const selected = selectedMangaIds.has(manga.id);
        const cover = manga.thumbnailUrl ? (manga.thumbnailUrl.startsWith("http") ? manga.thumbnailUrl : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`) : "/placeholder-cover.svg";
        return <div key={manga.id} className={`flex items-center gap-4 border-b border-white/5 p-3 last:border-0 ${selected ? "bg-yomi-jade/10" : ""}`}>
          {isSelectMode && <button type="button" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-yomi-jade bg-yomi-jade text-ink-950" : "border-white/20"}`} aria-label={`${selected ? "Deselect" : "Select"} ${manga.title}`} onClick={() => onToggleSelectManga(manga.id)}>{selected && <Check className="h-4 w-4" />}</button>}
          <Link to={`/manga/${manga.id}`} onContextMenu={(event) => { event.preventDefault(); onToggleSelectManga(manga.id); }} className="flex min-w-0 flex-1 items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yomi-signature))]">
            <img src={cover} alt="" className="h-16 w-11 rounded-md object-cover" />
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{manga.title}</span><span className="mt-1 block text-xs text-slate-400">{manga.unreadCount ? `${manga.unreadCount} unread` : manga.hasStartedReading ? "Caught up" : "Not started"}</span></span>
          </Link>
        </div>;
      })}
    </div>
  );
}
