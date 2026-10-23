import { expect, type Page } from "@playwright/test";
import { mockSdk } from "../../../src/api/graphql/mockSdk";
import type { BoundTrackerRecord } from "../../../src/api/suwayomi/trackingActions";

export const trackerBackend = "http://127.0.0.1:45677";
export const largeRemoteId = "9007199254740993";
export function trackerFixture(options: { backend?: string; title?: string; linked?: boolean; failure?: boolean; expired?: boolean; number?: number; remote?: number } = {}) {
  const chapter = { id: 12, mangaId: 42, name: "Tracker chapter", chapterNumber: options.number ?? 1, sourceOrder: 1, pageCount: 2, isRead: false, isBookmarked: false, isDownloaded: false, lastPageRead: 0, uploadDate: "2026-10-24T10:00:00Z", scanlator: "Fixture" };
  const providers = [1, 2].map((id) => ({ id, name: id === 1 ? "First tracker" : "Second tracker", icon: "", authUrl: "https://tracker.example/login", isLoggedIn: true, isTokenExpired: id === 1 && !!options.expired, supportsPrivateTracking: id === 1, scores: ["10", "9", "0"], statuses: [{ name: "Reading", value: 1 }, { name: "Completed", value: 2 }] }));
  const makeRecord = (trackerId = 1, remoteId = largeRemoteId, title = "Chosen work", privateTrack = false): BoundTrackerRecord => ({ id: 500 + trackerId, trackerId, mangaId: 42, remoteId, title, lastChapterRead: options.remote ?? 0, totalChapters: 10, score: 9, displayScore: "9", status: 1, remoteUrl: "https://tracker.example/work/42", private: privateTrack });
  const initial = options.linked ? [makeRecord()] : [];
  return { backend: options.backend ?? trackerBackend, title: options.title ?? "Tracker fixture", chapter, providers, records: initial, remote: new Map(initial.map((item) => [item.id, item.lastChapterRead])), makeRecord,
    failure: !!options.failure, ignoreEdits: false, holdCompletion: false, held: false, releaseCompletion: undefined as (() => void) | undefined,
    searches: [] as any[], bindings: [] as any[], edits: [] as any[], unbindings: [] as any[], trackCalls: 0, refreshCalls: 0,
  };
}
export type TrackerFixture = ReturnType<typeof trackerFixture>;

export async function installTrackerFixture(page: Page, states: TrackerFixture[]) {
  await page.addInitScript(({ states }) => {
    if (localStorage.getItem("yomikura-settings")) return;
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: states[0].backend, mockMode: false, connectionStatus: "connected", readerMode: "LTR", pageSpread: "SINGLE", pageTransition: "none", autoDownloadCount: 0, autoDeleteReadChapters: false, activeProfileId: "first",
      profiles: states.map((item, index) => ({ id: index ? "second" : "first", name: index ? "Second fixture" : "First fixture", url: item.backend })),
    } }));
  }, { states: states.map(({ backend }) => ({ backend })) });
  await page.route("**/api/graphql", async (route) => {
    const state = states.find((item) => item.backend === new URL(route.request().url()).origin);
    if (!state) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const highest = state.chapter.isRead && state.chapter.chapterNumber > 0 ? state.chapter.chapterNumber : 0;
    let data: unknown;
    if (name === "GetMangaDetails") {
      const base = await mockSdk.GetMangaDetails({ id: 42 }); data = { manga: { ...base.manga, id: 42, title: state.title, inLibrary: true, categories: { edges: [] }, source: { name: "Fixture source" }, chapters: { edges: [{ node: state.chapter }] } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters: [state.chapter] } };
    else if (name === "GetMangaTrackers") data = { manga: { id: 42, title: state.title, trackRecords: { nodes: state.records } }, trackers: { nodes: state.providers }, chapters: { nodes: highest ? [{ chapterNumber: highest }] : [] } };
    else if (name === "SearchTracker") {
      state.searches.push(variables.input);
      data = { searchTracker: { trackSearches: [
        { id: 1, trackerId: variables.input.trackerId, remoteId: largeRemoteId, title: "Chosen work", coverUrl: "", summary: "The selected edition.", totalChapters: 10, lastChapterRead: 0, trackingUrl: "https://tracker.example/work/42", private: true, publishingType: "Manga", publishingStatus: "Ongoing" },
        { id: 2, trackerId: 999, remoteId: "123", title: "Another provider's work", coverUrl: "", summary: "", totalChapters: 10, lastChapterRead: 0, trackingUrl: "", private: false, publishingType: "Manga", publishingStatus: "Ongoing" },
      ] } };
    } else if (name === "BindTrackerWork") {
      const input = variables.input; state.bindings.push(input);
      const record = state.makeRecord(input.trackerId, input.remoteId, "Chosen work", input.private ?? false);
      record.lastChapterRead = Math.max(record.lastChapterRead, highest); state.records = [...state.records.filter((item) => item.trackerId !== input.trackerId), record]; state.remote.set(record.id, record.lastChapterRead);
      data = { bindTrack: { trackRecord: record } };
    } else if (name === "GetChapter") data = { chapter: { ...state.chapter, manga: { title: state.title, chapters: { edges: [{ node: { id: 12, chapterNumber: state.chapter.chapterNumber } }] } } } };
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [0, 1].map((index) => `${state.backend}/api/v1/manga/42/chapter/1/page/${index}`) } };
    else if (name === "UpdateChapterProgress") {
      Object.assign(state.chapter, variables.input.patch);
      if (variables.input.patch.isRead && state.holdCompletion) { state.held = true; await new Promise<void>((resolve) => { state.releaseCompletion = resolve; }); state.holdCompletion = false; }
      data = { updateChapter: { chapter: state.chapter } };
    } else if (name === "TrackProgress") {
      state.trackCalls += 1;
      if (!state.failure) for (const record of state.records) {
        const provider = state.providers.find((item) => item.id === record.trackerId);
        if (provider?.isLoggedIn && !provider.isTokenExpired) { const progress = Math.max(state.remote.get(record.id) ?? 0, highest); state.remote.set(record.id, progress); record.lastChapterRead = progress; }
      }
      data = { trackProgress: { trackRecords: state.records } };
    } else if (name === "RefreshTrackerRecord") {
      state.refreshCalls += 1; const record = state.records.find((item) => item.id === variables.input.recordId)!;
      record.lastChapterRead = state.remote.get(record.id) ?? 0; data = { fetchTrack: { trackRecord: record } };
    } else if (name === "UpdateTrack") {
      const input = variables.input; state.edits.push(input); const record = state.records.find((item) => item.id === input.recordId)!;
      if (!state.ignoreEdits) {
        if (input.lastChapterRead != null) { record.lastChapterRead = input.lastChapterRead; state.remote.set(record.id, input.lastChapterRead); }
        if (input.scoreString != null) { record.score = Number(input.scoreString); record.displayScore = input.scoreString; }
        if (input.status != null) record.status = input.status;
        if (input.private != null) record.private = input.private;
      }
      data = { updateTrack: { trackRecord: record } };
    } else if (name === "UnbindTrack") {
      state.unbindings.push(variables.input); state.records = state.records.filter((item) => item.id !== variables.input.recordId); data = { unbindTrack: { trackRecord: null } };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" };
    }
    try { await route.fulfill({ json: { data } }); } catch { /* A closed persistent browser cancels only its own requests. */ }
  });
  await page.route("**/api/v1/manga/42/chapter/1/page/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31564d"/></svg>' }));
  await page.route("https://images.unsplash.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"/>' }));
}

export const readerImage = (page: Page, number: number) => page.locator('[id^="reader-page-"]').getByRole("img", { name: `Page ${number}`, exact: true });
export const progressStatus = (page: Page) => page.getByRole("status", { name: "Progress synchronization", exact: true });
export async function finishTrackerChapter(page: Page) {
  await page.goto("/reader/12"); await expect(readerImage(page, 1)).toHaveCSS("opacity", "1");
  await page.keyboard.press("ArrowRight"); await expect(readerImage(page, 2)).toHaveCSS("opacity", "1");
}
export async function trackingHeads(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("yomikura-progress", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try { return await new Promise<any[]>((resolve, reject) => { const request = db.transaction("heads", "readonly").objectStore("heads").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
