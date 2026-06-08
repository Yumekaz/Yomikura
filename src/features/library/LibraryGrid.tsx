import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";

export interface LibraryManga {
  id: string | number;
  title: string;
  thumbnailUrl: string | null | undefined;
  unreadCount: number;
}

interface LibraryGridProps {
  mangas: LibraryManga[];
  serverBaseUrl: string;
}

export function LibraryGrid({ mangas, serverBaseUrl }: LibraryGridProps) {
  const { coverDensity } = useSettingsStore();

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

  // Determine grid container classes based on cover density
  const gridClasses = 
    coverDensity === "compact"
      ? "grid grid-cols-3 gap-2 p-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 lg:gap-3 lg:p-4"
      : coverDensity === "spacious"
      ? "grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 lg:gap-6 lg:p-8"
      : "grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 lg:gap-4 lg:p-6";

  // Determine card padding and title text classes
  const titleClasses =
    coverDensity === "compact"
      ? "line-clamp-2 text-[10px] sm:text-xs font-medium leading-tight text-white drop-shadow-md"
      : coverDensity === "spacious"
      ? "line-clamp-2 text-sm sm:text-base font-medium leading-snug text-white drop-shadow-md"
      : "line-clamp-2 text-xs font-medium leading-snug text-white drop-shadow-md sm:text-sm";

  const paddingClasses =
    coverDensity === "compact"
      ? "relative z-20 mt-auto p-1.5"
      : coverDensity === "spacious"
      ? "relative z-20 mt-auto p-4"
      : "relative z-20 mt-auto p-2.5";

  return (
    <div className={gridClasses}>
      {mangas.map((manga) => {
        // Handle absolute or relative thumbnail URLs safely
        let imageUrl = "/placeholder-cover.svg"; // Placeholder if no thumbnail
        if (manga.thumbnailUrl) {
          imageUrl = manga.thumbnailUrl.startsWith("http")
            ? manga.thumbnailUrl
            : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`;
        }

        return (
          <Link
            key={manga.id}
            to={`/manga/${manga.id}`}
            className="group relative flex aspect-[2/3] w-full flex-col overflow-hidden rounded-md bg-ink-850 transition hover:ring-2 hover:ring-yomi-jade/80"
          >
            {/* Background Image */}
            <div className="absolute inset-0 z-0">
              <img
                src={imageUrl}
                alt={manga.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Unread badge */}
            {manga.unreadCount > 0 && (
              <div className="absolute left-1.5 top-1.5 z-20 rounded bg-yomi-jade px-1.5 py-0.5 text-xs font-bold text-ink-950 shadow-sm">
                {manga.unreadCount}
              </div>
            )}

            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
            
            {/* Title */}
            <div className={paddingClasses}>
              <h4 className={titleClasses}>
                {manga.title}
              </h4>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
