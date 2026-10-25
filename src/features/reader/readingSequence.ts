import { createGraphqlClient } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { getCachedChaptersForManga } from "../../api/suwayomi/offlineCache";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { selectChapters, type ChapterPolicy, type PolicyChapter } from "../manga/chapterPolicy";

export async function loadReadingSequence(backend: ProgressBackend, mangaId: number, title: string, anchorId: number, policy: ChapterPolicy, signal?: AbortSignal) {
  const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, backend.isDemo ? "demo" : "live");
  let chapters: (PolicyChapter & { mangaId: number })[] = [];
  let offline = false;
  try {
    let after: string | undefined; let expected: number | undefined; const cursors = new Set<string>(); const ids = new Set<number>();
    for (;;) {
      const connection = (await sdk.GetReadingChapters({ mangaId, after })).chapters;
      if (expected !== undefined && expected !== connection.totalCount) throw new Error("The chapter list changed while loading. Retry continuation.");
      expected = connection.totalCount;
      for (const chapter of connection.nodes ?? []) {
        if (!chapter || chapter.mangaId !== mangaId || ids.has(chapter.id)) throw new Error("The chapter list could not be confirmed. Retry continuation.");
        ids.add(chapter.id); chapters.push({ ...chapter, uploadDate: String(chapter.uploadDate ?? "") });
      }
      if (!connection.pageInfo.hasNextPage) { if (chapters.length !== expected) throw new Error("The chapter list is incomplete. Retry continuation."); break; }
      const cursor = connection.pageInfo.endCursor;
      if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !connection.nodes?.length) throw new Error("Chapter pagination stopped making progress. Retry continuation.");
      cursors.add(cursor); after = cursor;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    const cached = await getCachedChaptersForManga(backend.serverBaseUrl, mangaId, backend.isDemo);
    if (!cached.length) throw error;
    chapters = cached.filter((chapter) => chapter.mangaTitle === title).map((chapter) => ({ ...chapter, isRead: chapter.isRead ?? false, isDownloaded: true })); offline = true;
  }
  if (signal?.aborted) throw new DOMException("Reader closed", "AbortError");
  if (!chapters.some((chapter) => Number(chapter.id) === anchorId)) throw new Error("The opening chapter is absent from the confirmed list. Reopen the reader.");
  const heads = await getProgressHeads(backend); const cached = await getCachedChaptersForManga(backend.serverBaseUrl, mangaId, backend.isDemo);
  const desired = chapters.map((chapter) => {
    const head = heads.find((head) => head.chapter.chapterId === Number(chapter.id) && head.chapter.mangaId === mangaId && head.chapter.mangaTitle === title && head.chapter.chapterName === chapter.name && head.chapter.chapterNumber === chapter.chapterNumber);
    return head && (offline || backend.isDemo || head.sequence > head.acknowledgedSequence) ? { ...chapter, isRead: head.patch.isRead } : chapter;
  });
  return { chapters: selectChapters(desired, policy, new Set(cached.map((chapter) => chapter.id)), anchorId).map((chapter) => ({ ...chapter, id: Number(chapter.id) })), offline };
}
