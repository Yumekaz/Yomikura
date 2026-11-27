// @vitest-environment happy-dom
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookNoteScope, getBookNoteDraft, saveBookNoteDraft } from "../../features/manga/bookNoteStorage";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { progressBackend } from "./backendIdentity";
import { testServerConnection } from "./connection";
import { metadataScope, readCover, readMetadata, saveCover, saveMetadata } from "./libraryMetadata";
import { assertLibrarySession, rememberedLibrary, rememberLibrary } from "./librarySession";
import { confirmManagedLibraryLocation, prepareManagedLibraryAddress } from "./managedLibraryContinuity";
import { allowManagedEngineSession, assertManagedEngineSession, managedLibraryLocations, movingManagedLibrary, recordManagedLibraryLocation } from "./managedLibraryLocations";
import { getCachedChapter, getDownloadJobs, getOwnedCachedPage, getReadingHistory, moveManagedOfflineRecords, recordReadingActivity, saveCachedChapter, saveDownloadJob } from "./offlineCache";
import { acquireProgressLease, enqueueProgress, getProgressHead, getProgressOperations, markProgressOperation } from "./progressStorage";
import { beginLibraryRestore } from "./restoreIdentity";

vi.mock("../../stores/settingsStorage", () => ({ createSettingsStorage: () => localStorage }));

const from = "http://127.0.0.1:4567";
const to = "http://127.0.0.1:4568";
const anotherPort = "http://127.0.0.1:4569";
const marker = "8ba96cab-7676-4c6c-bbe2-d542a49391e9";
const anotherMarker = "d86e08f2-f5bd-4553-a7b7-9a6f9a17be14";
const root = "C:/yomikura-test/library";
const chapter = { chapterId: 8, chapterName: "Chapter 1", chapterNumber: 1, mangaId: 10, mangaTitle: "Test comic", sourceOrder: 0, pageCount: 1 };
const cachedUrl = "http://127.0.0.1:4567/device-copy/verified-page";
const pagePath = "/api/v1/manga/10/chapter/0/page/0";
const coverPath = "/api/v1/manga/10/thumbnail";
const startup = { root, previousServer: from, server: to, returning: true, soleRegisteredRoot: true };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("caches", { open: async () => ({ match: async (url: string) => url === cachedUrl ? new Response("saved page") : undefined }) });
  rememberLibrary(from, { marker });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const saveKnownChapter = (serverBaseUrl: string, name = chapter.chapterName, libraryId = marker) => saveCachedChapter({
  id: chapter.chapterId, name, mangaId: chapter.mangaId, mangaTitle: chapter.mangaTitle,
  chapterNumber: chapter.chapterNumber, sourceOrder: chapter.sourceOrder, lastPageRead: 0, isRead: false,
  pageCount: 1, serverBaseUrl, libraryId, cacheKey: "", cachedAt: 1, totalSizeBytes: 10, pages: [pagePath], cachedUrls: [cachedUrl],
  networkUrls: [serverBaseUrl + pagePath],
});

const queuePosition = (server: string, lastPageRead: number) => enqueueProgress(progressBackend(server), {
  kind: "reading", chapter, baseline: { isRead: false, lastPageRead: 0 }, patch: { lastPageRead }, epoch: 0,
});

describe("managed local address continuity", () => {
  it("moves existing verified records from the old port without downloading their page bytes again", async () => {
    await saveKnownChapter(from);
    await saveDownloadJob({ serverBaseUrl: from, chapterId: 99, status: "queued", progress: 0, total: 0, attempts: 1, updatedAt: 2 });
    await recordReadingActivity(from, { ...chapter, lastPageRead: 0, isRead: false });
    const saved = await queuePosition(from, 0);
    const [pending] = await getProgressOperations(progressBackend(from));
    await acquireProgressLease(progressBackend(from), "previous-worker");
    await markProgressOperation(pending, "previous-worker", "sending");
    const note = { value: "unsent draft", base: "prior note", revision: "draft-1", pending: true };
    await saveBookNoteDraft({ ...note, key: bookNoteScope(progressBackend(from), chapter.mangaId, chapter.mangaTitle) });
    await saveMetadata(metadataScope(from), "library", { name: "retained library" });
    await saveCover(metadataScope(from), from + coverPath, new Blob(["cover"], { type: "image/png" }));

    await prepareManagedLibraryAddress(startup, { marker });
    rememberLibrary(to, { marker });
    await prepareManagedLibraryAddress(startup, { marker });

    expect(await getCachedChapter(from, chapter.chapterId)).toBeNull();
    expect(await getCachedChapter(to, chapter.chapterId)).toMatchObject({ libraryId: marker, cachedUrls: [cachedUrl], networkUrls: [to + pagePath] });
    expect(await (await getOwnedCachedPage(to + pagePath, to))?.text()).toBe("saved page");
    expect(await getDownloadJobs(to)).toMatchObject([{ chapterId: 99, status: "queued", attempts: 1 }]);
    expect(await getReadingHistory(to)).toMatchObject([{ chapterId: chapter.chapterId, libraryId: marker }]);
    expect(await getProgressHead(progressBackend(to), chapter.chapterId)).toMatchObject({ sequence: saved.head.sequence });
    expect(await getProgressOperations(progressBackend(to))).toMatchObject([{ sequence: pending.sequence, status: "pending", backend: { serverBaseUrl: to } }]);
    expect(await markProgressOperation(pending, "previous-worker", "blocked")).toBe(false);
    expect(await getProgressOperations(progressBackend(from))).toHaveLength(0);
    expect(await getBookNoteDraft(bookNoteScope(progressBackend(to), chapter.mangaId, chapter.mangaTitle))).toMatchObject(note);
    expect(await readMetadata(metadataScope(to), "library")).toEqual({ name: "retained library" });
    expect(await readCover(metadataScope(to), to + coverPath)).toMatchObject({ type: "image/png" });
    expect(managedLibraryLocations()).toEqual([{ root, server: to, marker, retired: [from] }]);
    await expect(assertLibrarySession(from, marker)).rejects.toThrow("has moved");
  });

  it("never merges another folder even when its database carries a copied marker", async () => {
    confirmManagedLibraryLocation(root, from, { marker });
    await saveKnownChapter(from);
    await expect(prepareManagedLibraryAddress({ ...startup, root: "C:/yomikura-test/copy", soleRegisteredRoot: false }, { marker })).rejects.toThrow("copy of another managed library");
    await prepareManagedLibraryAddress(startup, { marker: anotherMarker });
    expect(await getCachedChapter(from, chapter.chapterId)).toMatchObject({ libraryId: marker });
    expect(await getCachedChapter(to, chapter.chapterId, false, anotherMarker)).toBeNull();
  });

  it("leaves old data at its original address when older settings cannot prove a unique managed folder", async () => {
    await saveKnownChapter(from);
    await prepareManagedLibraryAddress({ ...startup, soleRegisteredRoot: false }, { marker });
    expect(await getCachedChapter(from, chapter.chapterId)).not.toBeNull();
    expect(await getCachedChapter(to, chapter.chapterId, false, marker)).toBeNull();
  });

  it("retries an interrupted move before moving again to a different port", async () => {
    confirmManagedLibraryLocation(root, from, { marker });
    await saveKnownChapter(from);
    await queuePosition(from, 0);
    recordManagedLibraryLocation({ root, server: from, marker, movingTo: to });
    expect(movingManagedLibrary(to)).toBe(true);
    await expect(saveKnownChapter(from)).rejects.toThrow("address is changing");
    expect(() => beginLibraryRestore(to)).toThrow("finish moving");
    // Simulate exiting after the offline store committed, with progress still at the old address.
    await moveManagedOfflineRecords(from, to, marker);
    expect(await getCachedChapter(from, chapter.chapterId)).toBeNull();
    expect(await getProgressOperations(progressBackend(from))).toHaveLength(1);

    await prepareManagedLibraryAddress({ ...startup, server: anotherPort }, { marker });
    rememberLibrary(anotherPort, { marker });
    expect(await getProgressOperations(progressBackend(anotherPort))).toHaveLength(1);
    expect(await getCachedChapter(anotherPort, chapter.chapterId)).not.toBeNull();
    expect(await getCachedChapter(to, chapter.chapterId, false, marker)).toBeNull();
    expect(movingManagedLibrary(to)).toBe(false);
  });

  it("preserves both records when the destination already holds a conflicting copy", async () => {
    rememberLibrary(to, { marker: anotherMarker });
    await queuePosition(to, 1);
    await queuePosition(from, 0);
    await saveKnownChapter(from, "old copy");
    await saveKnownChapter(to, "current copy");
    await prepareManagedLibraryAddress(startup, { marker });
    expect(await getCachedChapter(from, chapter.chapterId)).toMatchObject({ name: "old copy" });
    expect(await getCachedChapter(to, chapter.chapterId, false, marker)).toMatchObject({ name: "current copy" });
    expect(await getProgressOperations(progressBackend(to))).toMatchObject([{ libraryId: anotherMarker }]);
    expect(await getProgressOperations(progressBackend(from))).toMatchObject([{ libraryId: marker }]);
  });

  it("leaves a paused restore and its existing records attached to the original address", async () => {
    await saveKnownChapter(from);
    beginLibraryRestore(from);
    await expect(prepareManagedLibraryAddress(startup, { marker })).rejects.toThrow("paused restore");
    expect(await getCachedChapter(from, chapter.chapterId)).not.toBeNull();
    expect(movingManagedLibrary(from)).toBe(false);
  });

  it("does not accept a different identity if the server changes after the address is selected", async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body));
      const data = query.includes("ConnectionTest") ? { __typename: "Query" } : {
        metas: { nodes: [{ key: "yomikura.library.identity.v1", value: anotherMarker }] },
      };
      return Response.json({ data });
    });
    vi.stubGlobal("fetch", request);

    await expect(testServerConnection(to, marker)).rejects.toThrow("identity changed");
    expect(rememberedLibrary(to)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("holds managed requests until the selected storage has an engine session", async () => {
    Object.defineProperty(window, "isTauri", { value: true, configurable: true });
    const previous = useSettingsStore.getState();
    const revoke = allowManagedEngineSession({ dataPath: root, profileId: "local", server: to });
    try {
      useSettingsStore.setState({ serverBaseUrl: to, serverDataPath: root, activeProfileId: "local", managedLibraryProfileId: "local" });
      await expect(assertManagedEngineSession(to)).resolves.toBeUndefined();
      useSettingsStore.setState({ serverDataPath: "C:/yomikura-test/copy" });
      await expect(assertManagedEngineSession(to)).rejects.toThrow("still verifying");
      revoke();
      await expect(assertManagedEngineSession(to)).rejects.toThrow("still verifying");
    } finally {
      revoke();
      useSettingsStore.setState(previous);
      Object.defineProperty(window, "isTauri", { value: false, configurable: true });
    }
  });
});
