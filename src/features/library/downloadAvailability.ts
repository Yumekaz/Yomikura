import type { CachedChapter } from "../../api/suwayomi/offlineCache";

export type AvailabilityFilter = "smart:downloaded" | "smart:on_device" | "smart:on_server";
export const isAvailabilityFilter = (value: string | number | null): value is AvailabilityFilter => value === "smart:downloaded" || value === "smart:on_device" || value === "smart:on_server";
export function deviceChapterCounts(chapters: CachedChapter[]) {
  const chaptersByManga = new Map<string, Set<number>>();
  for (const chapter of chapters) {
    const ids = chaptersByManga.get(String(chapter.mangaId)) ?? new Set<number>();
    ids.add(chapter.id); chaptersByManga.set(String(chapter.mangaId), ids);
  }
  return new Map([...chaptersByManga].map(([id, chapters]) => [id, chapters.size]));
}
export function matchesAvailability(filter: AvailabilityFilter, onDevice: boolean, onServer: boolean) {
  return filter === "smart:on_device" ? onDevice : filter === "smart:on_server" ? onServer : onDevice || onServer;
}
export function availabilityCounts(mangas: { id: string | number; downloadCount?: number | null }[], localCounts: Map<string, number>) {
  const result = { "smart:downloaded": 0, "smart:on_device": 0, "smart:on_server": 0 };
  for (const manga of mangas) for (const filter of Object.keys(result) as AvailabilityFilter[]) {
    if (matchesAvailability(filter, (localCounts.get(String(manga.id)) ?? 0) > 0, (manga.downloadCount ?? 0) > 0)) result[filter] += 1;
  }
  return result;
}
