import { createGraphqlClient } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { getCachedChaptersForManga } from "../../api/suwayomi/offlineCache";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { type ChapterPolicy, type PolicyChapter } from "../manga/chapterPolicy";
import { DEFAULT_SEQUENCE_CHOICES, selectReaderSequence, type ReaderSequenceChoices } from "./readerSequencePolicy";
import { fetchReadingChapters } from "../../api/library/fetchReadingChapters";

export async function loadReadingSequence(backend: ProgressBackend, mangaId: number, title: string, anchorId: number, policy: ChapterPolicy, signal?: AbortSignal, choices: ReaderSequenceChoices = DEFAULT_SEQUENCE_CHOICES) {
  const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, backend.isDemo ? "demo" : "live");
  let chapters: (PolicyChapter & { mangaId: number })[] = [];
  let offline = false;
  try {
    chapters = (await fetchReadingChapters(sdk, mangaId, signal)).map((chapter) => ({ ...chapter, uploadDate: String(chapter.uploadDate ?? "") }));
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
    return head && (offline || backend.isDemo || head.sequence > head.acknowledgedSequence) ? { ...chapter,
      ...(head.dirtyFields?.includes("isRead") ? { isRead: head.patch.isRead } : {}), ...(head.dirtyFields?.includes("lastPageRead") ? { lastPageRead: head.patch.lastPageRead } : {}),
      ...(head.patch.isBookmarked !== undefined ? { isBookmarked: head.patch.isBookmarked } : {}) } : chapter;
  });
  const cachedIds = new Set(cached.map((chapter) => chapter.id));
  return { chapters: selectReaderSequence(desired, policy, cachedIds, anchorId, choices).map((chapter) => ({ ...chapter, id: Number(chapter.id) })),
    downloadChapters: selectReaderSequence(desired, { ...policy, filter: "all" }, cachedIds, anchorId, { ...choices, skipRead: false }).map((chapter) => ({ ...chapter, id: Number(chapter.id) })), offline };
}
