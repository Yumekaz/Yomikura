import { createGraphqlClient } from "../graphql/client";
import { captureNoteExport, importNoteExport, parseNoteExport } from "../../features/manga/notePortability";
import { addMissingBookNotes, bookNoteScope } from "../../features/manga/bookNoteStorage";
import { parseRecoveryPreferences, type RecoveryPreferences } from "../../stores/recoveryPreferences";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { chapterIdentityMatches, progressBackend, type ProgressBackend } from "./backendIdentity";
import { createRecoveryFile, describeRecoveryPage, MAX_RECOVERY_BYTES, openRecoveryFile, verifyRecoveryPage, type RecoveryChapter, type RecoveryManifest } from "./deviceRecoveryFormat";
import { checkpointRecovery, readRecoveryJob, runRecovery, stageRecoveryJob, type RecoveryJob } from "./deviceRecoveryJournal";
import { captureRecoveryKeys, createRecoveryMatcher } from "./deviceRecoveryMatching";
import { assertLibrarySession } from "./librarySession";
import { addMissingCachedChapter, cleanupUnreferencedCachedPages, getCachedChapter, getCachedChapters, getChapterCacheKey } from "./offlineCache";
import { buildSuwayomiPageUrl } from "./pageUrls";
import { AlreadyRecoveredProgress, getProgressHead, getProgressHeads } from "./progressStorage";
import { cachedIdentity, isCurrentProgressBackend, progressChapterIdentity, saveProgressIntent, synchronizeProgress } from "./progressSync";
import { validatePageBlob } from "./validatePageBlob";

const pageCache = "yomikura-page-cache";

function captureRecoveryPreferences() {
  const settings = useSettingsStore.getState();
  return parseRecoveryPreferences({ ...settings, reader: settings.experience.reader, downloads: settings.experience.downloads });
}

function applyRecoveryPreferences({ reader, downloads, customKeybinds, ...settings }: RecoveryPreferences) {
  return useSettingsStore.setState((current) => ({
    ...settings,
    ...(customKeybinds ? { customKeybinds: { ...current.customKeybinds, ...customKeybinds } } : {}),
    experience: { ...current.experience, reader, downloads: { ...current.experience.downloads, ...downloads } },
  }));
}

export function recoveryBackend() {
  const { serverBaseUrl, mockMode } = useSettingsStore.getState();
  return progressBackend(serverBaseUrl, mockMode);
}

export async function captureDeviceRecovery(backend: ProgressBackend, includePages: boolean, includeSourceKeys = false) {
  const libraryId = backend.isDemo ? null : backend.libraryId ?? null;
  if (includePages && !libraryId) throw new Error("Connect to the library that owns the saved chapters before including pages.");
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
  const manifest: RecoveryManifest = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), libraryId, preferences, notes, progress, chapters };
  if (includeSourceKeys) {
    await confirmRecoveryLibrary(backend, libraryId);
    manifest.sourceKeys = await captureRecoveryKeys(backend, manifest);
    await confirmRecoveryLibrary(backend, libraryId);
  }
  return createRecoveryFile(manifest, pageBlobs);
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
    await applyRecoveryPreferences(undo ? before : archive.manifest.preferences);
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

function checkRecoveryTarget(job: RecoveryJob, backend: ProgressBackend) {
  if (job.target && job.target !== backend.serverBaseUrl) throw new Error("Reconnect to the library address used to start this import before retrying.");
}

export function selectRebuiltRecoveryLibrary(id: string, backend: ProgressBackend) {
  return runRecovery(async () => {
    const { job, archive: { manifest } } = await staged(id);
    const keys = manifest.sourceKeys;
    if (!keys?.books.length) throw new Error("This file has no source identifiers for a rebuilt library.");
    if (job.target) throw new Error("This recovery file is already tied to a library. Finish that import or reopen the original file for another library.");
    await confirmRecoveryLibrary(backend, backend.libraryId ?? null);
    const matcher = createRecoveryMatcher(backend, keys);
    let matched = false;
    for (const entry of [...manifest.chapters, ...manifest.progress.map(({ chapter }) => chapter)]) {
      if (await matcher.matchChapter(entry)) { matched = true; break; }
    }
    if (!matched) for (const note of manifest.notes) {
      if (await matcher.matchBook(note.mangaId)) { matched = true; break; }
    }
    if (!matched) throw new Error("No books or chapters could be verified. Restore the matching Suwayomi backup and confirm the source entries before retrying.");
    await confirmRecoveryLibrary(backend, backend.libraryId ?? null);
    await checkpointRecovery(id, (current) => ({ ...current, target: backend.serverBaseUrl, rebuiltLibraryId: backend.libraryId }));
  });
}

export function restoreDeviceRecords(id: string, backend: ProgressBackend) {
  return runRecovery(async () => {
    const { job, archive } = await staged(id);
    const { manifest } = archive;
    if (job.deviceRecordsRestored) return;
    const libraryId = job.rebuiltLibraryId ?? manifest.libraryId;
    checkRecoveryTarget(job, backend);
    await confirmRecoveryLibrary(backend, libraryId);
    const server = backend.serverBaseUrl;
    await checkpointRecovery(id, (current) => ({ ...current, target: server }));
    const matcher = job.rebuiltLibraryId && manifest.sourceKeys ? createRecoveryMatcher(backend, manifest.sourceKeys) : undefined;
    let unmatched = 0;

    if (matcher && manifest.notes.length) {
      const drafts = [];
      for (const note of manifest.notes) {
        const book = await matcher.matchBook(note.mangaId);
        if (!book) { unmatched++; continue; }
        drafts.push({ key: bookNoteScope(backend, book.id, book.title), value: note.value, base: null, pending: true, revision: crypto.randomUUID() });
      }
      await confirmRecoveryLibrary(backend, libraryId);
      await addMissingBookNotes(drafts);
    } else if (manifest.notes.length) {
      const result = await importNoteExport(JSON.stringify({ format: "yomikura-notes", version: 1, notes: manifest.notes }), backend);
      unmatched += result.unmatched;
    }

    const cache = manifest.chapters.length ? await caches.open(pageCache) : undefined;
    for (const [index, chapter] of manifest.chapters.entries()) {
      await confirmRecoveryLibrary(backend, libraryId);
      const remote = matcher ? await matcher.matchChapter(chapter) : (await libraryClient(backend).GetChapter({ id: chapter.chapterId })).chapter;
      if (!remote || !matcher && !chapterIdentityMatches(chapter, progressChapterIdentity(remote)) ||
          (remote.pageCount > 0 && remote.pageCount !== chapter.pageCount)) { unmatched++; continue; }
      if (await getCachedChapter(server, remote.id, false, backend.libraryId)) continue;
      const pages = archive.pages[index];
      const networkUrls = pages.map((_, pageIndex) => buildSuwayomiPageUrl({ serverBaseUrl: server, mangaId: remote.mangaId, chapterSourceOrder: remote.sourceOrder, pageIndex }));
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
      await confirmRecoveryLibrary(backend, libraryId);
      await addMissingCachedChapter({
        cacheKey: getChapterCacheKey(server, remote.id, false, backend.libraryId), libraryId: backend.libraryId, serverBaseUrl: server, isDemo: false,
        id: remote.id, name: remote.name, chapterNumber: remote.chapterNumber, mangaId: remote.mangaId,
        mangaTitle: remote.manga.title, sourceOrder: remote.sourceOrder, pageCount: pages.length,
        pages: networkUrls, networkUrls, cachedUrls, totalSizeBytes: pages.reduce((total, page) => total + page.size, 0),
        // Imported page bytes must not seed an unreviewed reading update when
        // the offline reader records the first page it displays.
        cachedAt: Date.now(), lastPageRead: Math.max(0, Math.min(remote.lastPageRead, pages.length - 1)),
        isRead: remote.isRead, isBookmarked: remote.isBookmarked,
      });
    }
    await confirmRecoveryLibrary(backend, libraryId);
    if (unmatched) throw new Error(`${unmatched} notes or chapters could not be matched safely. The file stays staged so you can recover them later.`);
    await checkpointRecovery(id, (current) => ({ ...current, deviceRecordsRestored: true }));
  });
}

function serverProgress(chapter: { lastPageRead: number; isRead: boolean; isBookmarked: boolean; lastReadAt?: unknown }) {
  return { lastPageRead: chapter.lastPageRead, isRead: chapter.isRead, isBookmarked: chapter.isBookmarked, lastReadAt: String(chapter.lastReadAt ?? "") };
}

export async function previewRecoveredProgress(id: string, chapterId: number, backend: ProgressBackend) {
  const { archive, job } = await staged(id);
  const entry = archive.manifest.progress.find((progress) => progress.chapter.chapterId === chapterId);
  if (!entry) throw new Error("This reading update is missing from the staged file.");
  checkRecoveryTarget(job, backend);
  const libraryId = job.rebuiltLibraryId ?? archive.manifest.libraryId;
  const matcher = job.rebuiltLibraryId && archive.manifest.sourceKeys ? createRecoveryMatcher(backend, archive.manifest.sourceKeys) : undefined;
  await confirmRecoveryLibrary(backend, libraryId);
  let chapter = matcher ? await matcher.matchChapter(entry.chapter) : (await libraryClient(backend).GetChapter({ id: chapterId })).chapter;
  if (!chapter || !matcher && !chapterIdentityMatches(entry.chapter, progressChapterIdentity(chapter))) throw new Error("This chapter could not be matched in the selected library.");
  if (matcher && !chapter.pageCount && (entry.patch.lastPageRead ?? 0) > 0) {
    // Suwayomi backups can restore a chapter before its page count is initialized.
    // The progress mutation clamps positions to that count, so fetch the list first.
    await libraryClient(backend).FetchChapterPages({ input: { chapterId: chapter.id } });
    const refreshed = await matcher.matchChapter(entry.chapter);
    if (!refreshed || refreshed.id !== chapter.id) throw new Error("The chapter changed while its page count was checked. Review it again.");
    chapter = refreshed;
  }
  if (entry.patch.lastPageRead !== undefined && entry.patch.lastPageRead >= chapter.pageCount && entry.patch.lastPageRead !== 0) throw new Error("The saved page does not exist in this copy of the chapter.");
  await confirmRecoveryLibrary(backend, libraryId);
  const before = await getProgressHead(backend, chapter.id);
  return { entry, snapshot: serverProgress(chapter), identity: progressChapterIdentity(chapter), sequence: before?.sequence ?? 0, archiveId: archive.manifest.id };
}

export function applyRecoveredProgress(id: string, chapterId: number, backend: ProgressBackend, reviewed: Awaited<ReturnType<typeof previewRecoveredProgress>>) {
  return runRecovery(async () => {
    const { entry, snapshot, identity, archiveId } = await previewRecoveredProgress(id, chapterId, backend);
    if (!chapterIdentityMatches(reviewed.identity, identity) || JSON.stringify(snapshot) !== JSON.stringify(reviewed.snapshot)) throw new Error("Server progress changed during review. Open the current update again.");
    const recoveryKey = JSON.stringify([archiveId, backend.libraryId, identity.chapterId]);
    const saved = await saveProgressIntent(backend, { kind: "explicit", chapter: identity, baseline: snapshot,
      patch: entry.patch, expectedSequence: reviewed.sequence, recoveryKey, recoveryBaseline: snapshot }).catch((error: unknown) => {
      if (error instanceof AlreadyRecoveredProgress) return undefined;
      throw error;
    });
    if (saved && !saved.accepted) throw new Error("This chapter has existing or changed device progress. Resolve it before applying this recovered update.");
    await checkpointRecovery(id, (current) => ({ ...current, target: backend.serverBaseUrl, reviewedProgress: Array.from(new Set([...(current.reviewedProgress ?? []), chapterId])) }));
    await synchronizeProgress(backend);
    return saved?.accepted ?? false;
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
