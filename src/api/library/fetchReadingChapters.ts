import type { SuwayomiSdk } from "../graphql/client";
export async function fetchReadingChapters(sdk: Pick<SuwayomiSdk, "GetReadingChapters">, mangaId: number, signal?: AbortSignal) {
  const nodes: Awaited<ReturnType<SuwayomiSdk["GetReadingChapters"]>>["chapters"]["nodes"] = [];
  let after: string | undefined, expected: number | undefined; const cursors = new Set<string>(), ids = new Set<number>();
  for (;;) {
    const connection = (await sdk.GetReadingChapters({ mangaId, after }, undefined, signal)).chapters;
    if (expected !== undefined && expected !== connection.totalCount) throw new Error("The chapter list changed while loading. Retry continuation.");
    expected = connection.totalCount;
    for (const chapter of connection.nodes) { if (!chapter || chapter.mangaId !== mangaId || ids.has(chapter.id)) throw new Error("The chapter list could not be confirmed. Retry continuation."); ids.add(chapter.id); nodes.push(chapter); }
    if (!connection.pageInfo.hasNextPage) { if (nodes.length !== expected) throw new Error("The chapter list is incomplete. Retry continuation."); return nodes; }
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !connection.nodes.length) throw new Error("Chapter pagination stopped making progress. Retry continuation.");
    cursors.add(cursor); after = cursor;
  }
}
