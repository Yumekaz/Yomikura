import { createGraphqlClient } from "../graphql/client";
import { captureNoteExport, importNoteExport, parseNoteExport } from "../../features/manga/notePortability";
import { applyRecoveryPreferences, captureRecoveryPreferences } from "../../stores/recoveryPreferences";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { chapterIdentityMatches, progressBackend, type ProgressBackend } from "./backendIdentity";
import { createRecoveryFile, describeRecoveryPage, MAX_RECOVERY_BYTES, openRecoveryFile, verifyRecoveryPage, type RecoveryChapter, type RecoveryManifest } from "./deviceRecoveryFormat";
import { checkpointRecovery, readRecoveryJob, runRecovery, stageRecoveryJob } from "./deviceRecoveryJournal";
import { assertLibrarySession } from "./librarySession";
import { addMissingCachedChapter, cleanupUnreferencedCachedPages, getCachedChapter, getCachedChapters, getChapterCacheKey } from "./offlineCache";
import { buildSuwayomiPageUrl } from "./pageUrls";
import { getProgressHead, getProgressHeads } from "./progressStorage";
import { cachedIdentity, isCurrentProgressBackend, progressChapterIdentity, saveProgressIntent, synchronizeProgress } from "./progressSync";
import { validatePageBlob } from "./validatePageBlob";

const pageCache = "yomikura-page-cache";

export function recoveryBackend() {
  const { serverBaseUrl, mockMode } = useSettingsStore.getState();
  return progressBackend(serverBaseUrl, mockMode);
}

export async function captureDeviceRecovery(backend: ProgressBackend, includePages: boolean) {
  const libraryId = backend.isDemo ? null : backend.libraryId ?? null;
  const preferences = captureRecoveryPreferences();
  const notes = libraryId ? parseNoteExport(await captureNoteExport(backend)).notes : [];
  const progress = libraryId ? (await getProgressHeads(backend)).filter((head) => head.sequence > head.acknowledgedSequence).map((head) => ({
    chapter: head.chapter,
    patch: Object.fromEntries((head.dirtyFields ?? ["lastPageRead", "isRead"]).map((field) => [field, head.patch[field]])),
  })) : [];
  const chapters: RecoveryChapter[] = [];
  const pageBlobs: Blob[] = [];
  let size = 0;
  if (includePages && libraryId) {
    const cache = await caches.open(pageCache);
    for (const chapter of await getCachedChapters(backend.serverBaseUrl, false, libraryId, true)) {
      const pages: RecoveryChapter["pages"] = [];
      for (const url of chapter.cachedUrls) {
        const response = await cache.match(url);
        if (!response?.ok) throw new Error(`A saved page is missing from ${chapter.name}. Export without pages or download that chapter again.`);
        const body = await response.blob();
        size += body.size;
        if (size > MAX_RECOVERY_BYTES) throw new Error("Downloaded pages exceed 2 GB. Export without pages to keep your notes and progress.");
        pages.push(await describeRecoveryPage(body));
        pageBlobs.push(body);
      }
      chapters.push({ ...cachedIdentity(chapter), sourceOrder: chapter.sourceOrder, pages, lastPageRead: chapter.lastPageRead ?? 0, isRead: chapter.isRead ?? false });
    }
  }
  if (!isCurrentProgressBackend(backend)) throw new Error("The selected library changed during export. Start the export again.");
  return createRecoveryFile({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), libraryId, preferences, notes, progress, chapters }, pageBlobs);
}

export async function stageDeviceRecovery(file: Blob) {
  return runRecovery(async () => {
    const archive = await openRecoveryFile(file);
    for (const pages of archive.pages) for (const page of pages) await verifyRecoveryPage(page);
    const job = await stageRecoveryJob(file);
    return { job, manifest: archive.manifest };
  });
}

async function staged(id: string) {
  const job = await readRecoveryJob();
  if (!job || job.id !== id) throw new Error("Open a recovery file to continue.");
  return { job, archive: await openRecoveryFile(job.file) };
}

export function restoreDevicePreferences(id: string, undo = false) {
  return runRecovery(async () => {
    const { job, archive } = await staged(id);
    const before = job.previousPreferences ?? captureRecoveryPreferences();
    if (undo && !job.previousPreferences) throw new Error("There are no earlier preferences to restore.");
    if (!undo && job.preferencesApplied) return;
    await checkpointRecovery(id, (current) => ({ ...current, previousPreferences: before }));
    // If interrupted between these writes, the before-copy remains available.
    applyRecoveryPreferences(undo ? before : archive.manifest.preferences);
    await checkpointRecovery(id, (current) => ({ ...current, preferencesApplied: !undo }));
  });
}

async function confirmRecoveryLibrary(backend: ProgressBackend, libraryId: RecoveryManifest["libraryId"]) {
  if (!libraryId || backend.isDemo || backend.libraryId !== libraryId || !isCurrentProgressBackend(backend)) {
    throw new Error("Connect to the library that created this recovery file. Its device records are still staged.");
  }
  await assertLibrarySession(backend.serverBaseUrl, libraryId);
  if (!isCurrentProgressBackend(backend)) throw new Error("The selected library changed. Reconnect before continuing recovery.");
}

function libraryClient(backend: ProgressBackend) {
  return createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null, signal: AbortSignal.timeout(20000) }, "live");
}

export function restoreDeviceRecords(id: string, backend: ProgressBackend) {
  return runRecovery(async () => {
    const { job, archive } = await staged(id);
    const { manifest } = archive;
    if (job.deviceRecordsRestored) return;
    await confirmRecoveryLibrary(backend, manifest.libraryId);
    const server = backend.serverBaseUrl;
    if (job.target && job.target !== server) throw new Error("Reconnect to the library address used to start this import before retrying.");
    await checkpointRecovery(id, (current) => ({ ...current, target: server }));

    if (manifest.notes.length) {
      const result = await importNoteExport(JSON.stringify({ format: "yomikura-notes", version: 1, notes: manifest.notes }), backend);
      if (result.unmatched) throw new Error(`${result.unmatched} notes could not be matched. Restore the missing books, then retry the staged file.`);
    }

    const cache = manifest.chapters.length ? await caches.open(pageCache) : undefined;
    for (const [index, chapter] of manifest.chapters.entries()) {
      await confirmRecoveryLibrary(backend, manifest.libraryId);
      if (await getCachedChapter(server, chapter.chapterId, false, backend.libraryId)) continue;
      const { chapter: remote } = await libraryClient(backend).GetChapter({ id: chapter.chapterId });
      if (!remote || !chapterIdentityMatches(chapter, progressChapterIdentity(remote)) || (remote.pageCount > 0 && remote.pageCount !== chapter.pageCount)) {
        throw new Error(`“${chapter.chapterName}” could not be matched in this library. Restore the missing chapter, then retry.`);
      }
      const pages = archive.pages[index];
      const networkUrls = pages.map((_, pageIndex) => buildSuwayomiPageUrl({ serverBaseUrl: server, mangaId: chapter.mangaId, chapterSourceOrder: chapter.sourceOrder, pageIndex }));
      const cachedUrls = networkUrls.map((url) => {
        const address = new URL(url);
        // Stage under this job until the complete chapter has a visible cache record.
        address.searchParams.set("__yomi_recovery", id);
        return address.toString();
      });
      for (const [pageIndex, page] of pages.entries()) {
        await verifyRecoveryPage(page);
        await validatePageBlob(page.body, AbortSignal.timeout(30000));
        await cache!.put(cachedUrls[pageIndex], new Response(page.body, { headers: { "content-type": page.type, "x-content-type-options": "nosniff" } }));
      }
      await confirmRecoveryLibrary(backend, manifest.libraryId);
      await addMissingCachedChapter({
        cacheKey: getChapterCacheKey(server, chapter.chapterId, false, backend.libraryId), libraryId: backend.libraryId, serverBaseUrl: server, isDemo: false,
        id: chapter.chapterId, name: chapter.chapterName, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId,
        mangaTitle: chapter.mangaTitle, sourceOrder: chapter.sourceOrder, pageCount: pages.length,
        pages: networkUrls, networkUrls, cachedUrls, totalSizeBytes: pages.reduce((total, page) => total + page.size, 0),
        cachedAt: Date.now(), lastPageRead: chapter.lastPageRead, isRead: chapter.isRead, isBookmarked: remote.isBookmarked,
      });
    }
    await confirmRecoveryLibrary(backend, manifest.libraryId);
    await checkpointRecovery(id, (current) => ({ ...current, deviceRecordsRestored: true }));
  });
}

function serverProgress(chapter: { lastPageRead: number; isRead: boolean; isBookmarked: boolean; lastReadAt: unknown }) {
  return { lastPageRead: chapter.lastPageRead, isRead: chapter.isRead, isBookmarked: chapter.isBookmarked, lastReadAt: String(chapter.lastReadAt ?? "") };
}

export async function previewRecoveredProgress(id: string, chapterId: number, backend: ProgressBackend) {
  const { archive } = await staged(id);
  const entry = archive.manifest.progress.find((progress) => progress.chapter.chapterId === chapterId);
  if (!entry) throw new Error("This reading update is missing from the staged file.");
  await confirmRecoveryLibrary(backend, archive.manifest.libraryId);
  const { chapter } = await libraryClient(backend).GetChapter({ id: chapterId });
  if (!chapter || !chapterIdentityMatches(entry.chapter, progressChapterIdentity(chapter))) throw new Error("This chapter could not be matched in the selected library.");
  if (entry.patch.lastPageRead !== undefined && entry.patch.lastPageRead >= chapter.pageCount && entry.patch.lastPageRead !== 0) throw new Error("The saved page does not exist in this copy of the chapter.");
  await confirmRecoveryLibrary(backend, archive.manifest.libraryId);
  return { entry, snapshot: serverProgress(chapter), identity: progressChapterIdentity(chapter), archiveId: archive.manifest.id };
}

export function applyRecoveredProgress(id: string, chapterId: number, backend: ProgressBackend, reviewed: ReturnType<typeof serverProgress>) {
  return runRecovery(async () => {
    const before = await getProgressHead(backend, chapterId);
    const { entry, snapshot, identity, archiveId } = await previewRecoveredProgress(id, chapterId, backend);
    if (JSON.stringify(snapshot) !== JSON.stringify(reviewed)) throw new Error("Server progress changed during review. Open the current update again.");
    const recoveryKey = JSON.stringify([archiveId, backend.libraryId, chapterId]);
    const saved = await saveProgressIntent(backend, { kind: "explicit", chapter: identity, baseline: snapshot,
      patch: entry.patch, expectedSequence: before?.sequence ?? 0, recoveryKey, recoveryBaseline: snapshot });
    if (!saved.accepted && saved.reason !== "already-recovered") throw new Error("This chapter has existing or changed device progress. Resolve it before applying this recovered update.");
    await checkpointRecovery(id, (current) => ({ ...current, reviewedProgress: Array.from(new Set([...(current.reviewedProgress ?? []), chapterId])) }));
    await synchronizeProgress(backend);
    return saved.accepted;
  });
}

export function removeStagedRecovery(id: string) {
  return runRecovery(async () => {
    const job = await readRecoveryJob();
    if (!job || job.id !== id) throw new Error("The staged recovery file changed.");
    if (job.target) {
      const cache = await caches.open(pageCache);
      const urls = (await cache.keys()).filter((request) => new URL(request.url).searchParams.get("__yomi_recovery") === id).map((request) => request.url);
      await cleanupUnreferencedCachedPages(urls);
    }
    await checkpointRecovery(id, () => undefined);
  });
}
