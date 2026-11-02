import { createGraphqlClient } from "../graphql/client";
import { fetchReadingChapters } from "../library/fetchReadingChapters";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { DEFAULT_DOWNLOAD_EXPERIENCE, type DownloadExperience } from "../../stores/downloadExperience";
import { chapterIdentityMatches, progressBackend, type ChapterProgressIdentity, type ProgressBackend } from "./backendIdentity";
import { acquireProgressLease, getProgressHead, releaseProgressLease } from "./progressStorage";
import { deleteCachedChapter, getCachedChapter } from "./offlineCache";
import { CLEANUP_CHANGED, cleanupJobKey, getCleanupJobs, isCurrentCleanupJob, removeCleanupJob, saveCleanupJob, type CleanupJob } from "./cleanupStorage";
import { rememberedLibrary, assertLibrarySession } from "./librarySession";
export { CLEANUP_CHANGED } from "./cleanupStorage";
const inFlight = new Map<string, Promise<void>>();
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(CLEANUP_CHANGED)); };
const preferences = () => useSettingsStore.getState().experience?.downloads ?? DEFAULT_DOWNLOAD_EXPERIENCE;
const enabled = (job: CleanupJob) => job.kind === "automatic" ? useSettingsStore.getState().autoDeleteReadChapters : preferences().removeAfterMarkedRead;
const selected = (backend: ProgressBackend) => { try { const value = useSettingsStore.getState(); return progressBackend(value.serverBaseUrl, value.mockMode).key === backend.key; } catch { return false; } };
export function cleanupProtection(preferences: DownloadExperience, backend: ProgressBackend, context: { isRead: boolean; isBookmarked?: boolean; categoryIds?: number[] }, localBookmark = false): string | undefined {
  if (!context.isRead) return "unread";
  if (preferences.keepBookmarked && (context.isBookmarked !== false || localBookmark)) return "bookmark";
  const excluded = preferences.excludedCategories[backend.key] ?? [];
  if (excluded.length && (!context.categoryIds || excluded.some((id) => context.categoryIds!.includes(id) || id === 0 && context.categoryIds!.length === 0))) return "collection";
}
export async function queueDownloadCleanup(backend: ProgressBackend, chapter: ChapterProgressIdentity, epoch: number, sequence: number, kind: CleanupJob["kind"]) {
  const settings = useSettingsStore.getState();
  if (kind === "automatic" ? !settings.autoDeleteReadChapters : !preferences().removeAfterMarkedRead) return;
  await saveCleanupJob({ key: cleanupJobKey(backend, chapter.chapterId), backend, chapter, epoch, sequence, completedAt: Date.now(), kind }); changed();
}
async function currentHead(job: CleanupJob) {
  const head = await getProgressHead(job.backend, job.chapter.chapterId);
  return head && head.epoch === job.epoch && head.patch.isRead && head.acknowledgedSequence >= job.sequence && chapterIdentityMatches(job.chapter, head.chapter) ? head : undefined;
}
async function drain(backend: ProgressBackend) {
  const lease = { ...backend, key: `${backend.key}:download-cleanup` }, owner = crypto.randomUUID();
  if (!await acquireProgressLease(lease, owner)) return;
  const sdk = createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live");
  const lists = new Map<number, Awaited<ReturnType<typeof fetchReadingChapters>>>();
  try {
    for (const job of await getCleanupJobs(backend)) {
      if (!selected(backend)) return;
      if (!backend.isDemo && (!job.backend.libraryId || job.backend.libraryId !== rememberedLibrary(backend.serverBaseUrl)?.marker)) continue;
      const policy = preferences();
      if (!enabled(job)) { await removeCleanupJob(job); continue; }
      if (!await currentHead(job)) { await removeCleanupJob(job); continue; }
      if (Date.now() < job.completedAt + policy.cleanupDelayHours * 3600000) continue;
      try {
        if (!backend.isDemo) await assertLibrarySession(backend.serverBaseUrl, job.backend.libraryId);
        const context = (await sdk.GetCleanupChapterContext({ id: job.chapter.chapterId }, undefined, AbortSignal.timeout(15_000))).chapter;
        const identity = { chapterId: context.id, chapterName: context.name, chapterNumber: context.chapterNumber, sourceOrder: context.sourceOrder, pageCount: context.pageCount, mangaId: context.mangaId, mangaTitle: context.manga?.title ?? "" };
        if (!chapterIdentityMatches(job.chapter, identity)) { await removeCleanupJob(job); continue; }
        const cached = await getCachedChapter(backend.serverBaseUrl, context.id, backend.isDemo), head = await currentHead(job);
        if (!head || cached && !chapterIdentityMatches(job.chapter, { chapterId: cached.id, chapterName: cached.name, chapterNumber: cached.chapterNumber, mangaId: cached.mangaId, mangaTitle: cached.mangaTitle, sourceOrder: cached.sourceOrder, pageCount: cached.pageCount }) || cleanupProtection(policy, backend, { isRead: backend.isDemo ? head.patch.isRead : context.isRead, isBookmarked: context.isBookmarked, categoryIds: context.manga?.categories?.nodes.map((category) => category.id) }, cached?.isBookmarked || head.patch.isBookmarked)) { await removeCleanupJob(job); continue; }
        if (policy.keepRecentChapters > 0 && job.kind === "automatic") {
          let chapters = lists.get(context.mangaId); if (!chapters) { chapters = await fetchReadingChapters(sdk, context.mangaId, AbortSignal.timeout(15_000)); lists.set(context.mangaId, chapters); }
          const later = new Set(chapters.filter((chapter) => chapter.isRead && (chapter.chapterNumber >= 0 && context.chapterNumber >= 0 ? chapter.chapterNumber > context.chapterNumber : chapter.sourceOrder > context.sourceOrder)).map((chapter) => chapter.chapterNumber >= 0 ? `number:${chapter.chapterNumber}` : `id:${chapter.id}`));
          if (later.size < policy.keepRecentChapters) continue;
        }
        const lastHead = await currentHead(job), lastCopy = await getCachedChapter(backend.serverBaseUrl, context.id, backend.isDemo);
        if (!selected(backend) || !lastHead || !await isCurrentCleanupJob(job) || !await acquireProgressLease(lease, owner)) continue;
        if (!enabled(job)) { await removeCleanupJob(job); continue; }
        if (preferences() !== policy) continue;
        if (cleanupProtection(policy, backend, { isRead: backend.isDemo ? lastHead.patch.isRead : context.isRead, isBookmarked: context.isBookmarked, categoryIds: context.manga?.categories?.nodes.map((category) => category.id) }, lastCopy?.isBookmarked || lastHead.patch.isBookmarked)) { await removeCleanupJob(job); continue; }
        if (context.isDownloaded) await sdk.DeleteDownloadedChapter({ input: { id: context.id } }, undefined, AbortSignal.timeout(15_000));
        // A reset while server removal was in flight keeps the independent device copy.
        const after = await currentHead(job), copy = await getCachedChapter(backend.serverBaseUrl, context.id, backend.isDemo);
        if (selected(backend) && enabled(job) && after && await isCurrentCleanupJob(job) && preferences() === policy && !cleanupProtection(policy, backend, { isRead: true, isBookmarked: context.isBookmarked, categoryIds: context.manga?.categories?.nodes.map((category) => category.id) }, copy?.isBookmarked || after.patch.isBookmarked)) await deleteCachedChapter(backend.serverBaseUrl, context.id, backend.isDemo);
        await removeCleanupJob(job); changed();
      } catch { /* Retain files and the durable job until metadata/storage can be checked again. */ }
    }
  } finally { await releaseProgressLease(lease, owner); }
}
export function runDownloadCleanup(backend: ProgressBackend): Promise<void> {
  const current = inFlight.get(backend.key); if (current) return current;
  const pending = drain(backend).finally(() => { if (inFlight.get(backend.key) === pending) inFlight.delete(backend.key); }); inFlight.set(backend.key, pending); return pending;
}
