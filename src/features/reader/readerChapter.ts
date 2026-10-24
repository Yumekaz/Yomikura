import { createGraphqlClient, type SuwayomiSdk } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { chapterIdentityMatches } from "../../api/suwayomi/backendIdentity";
import { getCachedChapter, getCachedChaptersForManga } from "../../api/suwayomi/offlineCache";
import { cachedIdentity, progressChapterIdentity, projectChapterProgress } from "../../api/suwayomi/progressSync";
import { getProgressHead, progressHeadVersion } from "../../api/suwayomi/progressStorage";

type ChapterDetails = Awaited<ReturnType<SuwayomiSdk["GetChapter"]>>["chapter"];
export type ReaderChapterDetails = Awaited<ReturnType<typeof loadReaderChapterDetails>>;
export type ReaderChapter = {
  id: number; name: string; chapterNumber: number; mangaId: number; mangaTitle: string;
  sourceOrder: number; pages: string[]; isRead: boolean; lastPageRead: number;
  progressEpoch: number; progressBaseline: { isRead: boolean; lastPageRead: number };
};

const client = (backend: ProgressBackend, signal?: AbortSignal) => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal }, backend.isDemo ? "demo" : "live");

export async function loadReaderChapterDetails(backend: ProgressBackend, id: number, signal?: AbortSignal) {
  const observedVersion = progressHeadVersion(await getProgressHead(backend, id).catch(() => undefined));
  let details: ChapterDetails;
  let offline = false;
  try { details = (await client(backend, signal).GetChapter({ id })).chapter; }
  catch (error) {
    if (signal?.aborted) throw error;
    const cached = await getCachedChapter(backend.serverBaseUrl, id, backend.isDemo);
    if (!cached) throw error;
    const siblings = await getCachedChaptersForManga(backend.serverBaseUrl, cached.mangaId, backend.isDemo);
    details = { id: cached.id, name: cached.name, chapterNumber: cached.chapterNumber, isRead: cached.isRead ?? false,
      lastPageRead: cached.lastPageRead ?? 0, pageCount: cached.pageCount, sourceOrder: cached.sourceOrder, mangaId: cached.mangaId,
      manga: { title: cached.mangaTitle, chapters: { edges: siblings.map((chapter) => ({ node: { id: chapter.id, chapterNumber: chapter.chapterNumber } })) } },
    };
    offline = true;
  }
  return projectChapterProgress(backend, details, { offline, observedVersion });
}

export async function loadReaderChapterPages(backend: ProgressBackend, id: number, details: ReaderChapterDetails, signal?: AbortSignal) {
  let failure: unknown;
  try {
    const pages = (await client(backend, signal).FetchChapterPages({ input: { chapterId: id } })).fetchChapterPages?.pages ?? [];
    if (pages.length) return pages;
  } catch (error) { if (signal?.aborted) throw error; failure = error; }
  const cached = await getCachedChapter(backend.serverBaseUrl, id, backend.isDemo);
  if (cached?.pages.length && chapterIdentityMatches(progressChapterIdentity(details), cachedIdentity(cached))) return cached.pages;
  if (failure) throw failure;
  return [];
}

export function readerChapter(details: ReaderChapterDetails, pages: string[]): ReaderChapter {
  return { id: details.id, name: details.name, chapterNumber: details.chapterNumber, mangaId: details.mangaId,
    mangaTitle: details.manga?.title ?? "Unknown Manga", sourceOrder: details.sourceOrder, pages,
    isRead: details.isRead, lastPageRead: Math.max(0, Math.min(details.lastPageRead, pages.length - 1)),
    progressEpoch: details.progressEpoch, progressBaseline: details.progressBaseline,
  };
}

export async function loadReaderChapter(backend: ProgressBackend, id: number, signal?: AbortSignal) {
  const details = await loadReaderChapterDetails(backend, id, signal);
  const pages = await loadReaderChapterPages(backend, id, details, signal);
  if (!pages.length) throw new Error("Suwayomi did not return pages for the next chapter.");
  return readerChapter(details, pages);
}
