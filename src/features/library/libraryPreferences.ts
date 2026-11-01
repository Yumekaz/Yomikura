import { EMPTY_LIBRARY_FILTERS, type LibraryFilterName, type LibraryFilterSet } from "../../stores/experiencePreferences";
export interface LibraryTraits { downloaded: boolean; unread: boolean; started: boolean; bookmarked: boolean; completed: boolean }
export function libraryTraits(manga: { sourceId?: unknown; downloadCount?: number; unreadCount: number; chapters?: { totalCount: number }; lastReadChapter?: unknown; status?: string }, deviceCopies: number, bookmarked: boolean): LibraryTraits {
  return { downloaded: String(manga.sourceId) === "0" || (manga.downloadCount ?? 0) > 0 || deviceCopies > 0, unread: manga.unreadCount > 0,
    started: manga.chapters ? manga.chapters.totalCount > manga.unreadCount : !!manga.lastReadChapter,
    bookmarked, completed: manga.status === "COMPLETED" };
}
export function matchesLibraryPreferences(traits: LibraryTraits, filters: LibraryFilterSet): boolean {
  return (Object.keys(EMPTY_LIBRARY_FILTERS) as LibraryFilterName[]).every((key) => filters[key] === "any" || (filters[key] === "include" ? traits[key] : !traits[key]));
}
export function activeLibraryFilterCount(filters: LibraryFilterSet): number {
  return Object.values(filters).filter((choice) => choice !== "any").length;
}
export const LIBRARY_SORTS = ["title", "unread", "status", "last_read", "latest_update", "date_added", "total_chapters"] as const;
export type LibrarySort = typeof LIBRARY_SORTS[number];
export function validLibrarySort(value: unknown): value is LibrarySort { return LIBRARY_SORTS.includes(value as LibrarySort); }
export function librarySortScope(backendKey: string, categoryId: string | number | null): string { return JSON.stringify([backendKey, categoryId === null ? "all" : String(categoryId)]); }
export interface SortableLibraryBook { title: string; unreadCount: number; hasStartedReading: boolean; totalChapters?: number; lastReadAt?: number; latestUpdateAt?: number; addedAt?: number }
export function compareLibraryBooks(a: SortableLibraryBook, b: SortableLibraryBook, mode: LibrarySort, descending: boolean) {
  const direction = descending ? -1 : 1;
  const number = (book: SortableLibraryBook) => mode === "unread" ? book.unreadCount : mode === "last_read" ? book.lastReadAt ?? 0 : mode === "latest_update" ? book.latestUpdateAt ?? 0 : mode === "date_added" ? book.addedAt ?? 0 : mode === "total_chapters" ? book.totalChapters ?? 0 : book.hasStartedReading ? book.unreadCount ? 0 : 1 : 2;
  return mode === "title" ? a.title.localeCompare(b.title) * direction : (number(a) - number(b)) * direction || a.title.localeCompare(b.title);
}
