import type { SuwayomiSdk } from "../graphql/client";
export async function fetchBookmarkMembership(sdk: Pick<SuwayomiSdk, "GetBookmarkedLibraryChapters">, signal?: AbortSignal) {
  const mangaIds = new Set<number>(), chapterIds = new Set<number>(), cursors = new Set<string>();
  let after: string | undefined, expected: number | undefined;
  for (;;) {
    const page = (await sdk.GetBookmarkedLibraryChapters({ after }, undefined, signal)).chapters;
    if (expected !== undefined && page.totalCount !== expected) throw new Error("Bookmarks changed while loading. Try again.");
    expected = page.totalCount;
    for (const chapter of page.nodes) {
      if (chapterIds.has(chapter.id)) throw new Error("A bookmark page repeated. Try again.");
      chapterIds.add(chapter.id); mangaIds.add(chapter.mangaId);
    }
    if (!page.pageInfo.hasNextPage) {
      if (expected !== chapterIds.size) throw new Error("Bookmark information is incomplete. Try again.");
      return mangaIds;
    }
    const cursor = page.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !page.nodes.length) throw new Error("Bookmark pagination stopped making progress. Try again.");
    cursors.add(cursor); after = cursor;
  }
}
