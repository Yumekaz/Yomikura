import { parseChapterTimestamp } from "../manga/chapterDate";
export type UpdateDateMode = "discovered" | "published";
export interface UpdateCursor { after: string | undefined; seen: string[] }
export function nextUpdatePage(info: { hasNextPage: boolean; endCursor?: unknown }, current: UpdateCursor): UpdateCursor | undefined {
  if (!info.hasNextPage) return undefined;
  const cursor = info.endCursor;
  if (typeof cursor !== "string" || !cursor || cursor === current.after || current.seen.includes(cursor)) throw new Error("Update pagination could not be confirmed. Retry without discarding loaded chapters.");
  return { after: cursor, seen: current.after ? [...current.seen, current.after] : current.seen };
}
export function isLibraryDiscovery(item: { fetchedAt?: unknown; manga: { inLibraryAt?: unknown } }) {
  const fetched = parseChapterTimestamp(String(item.fetchedAt ?? "")); const added = parseChapterTimestamp(String(item.manga.inLibraryAt ?? ""));
  return !fetched || !added || fetched >= added;
}
export function updateTimestamp(item: { fetchedAt?: unknown; uploadDate?: unknown }, mode: UpdateDateMode) {
  return parseChapterTimestamp(String((mode === "discovered" ? item.fetchedAt : item.uploadDate) ?? ""));
}
