import { beforeEach, describe, expect, it, vi } from "vitest";
import { progressBackend } from "./backendIdentity";
import { bindTrackerWork, editTrackerRecord, pushLinkedTrackerProgress, searchTrackerWorks, synchronizeLinkedTrackersNow, trackerExternalUrl, unlinkTrackerRecord, type BoundTrackerRecord, type TrackerSearchResult } from "./trackingActions";
import { getPendingTracking, getProgressHeads, getProgressOperations, recordTrackingResult, suppressEarlierTracking } from "./progressStorage";

const mocks = vi.hoisted(() => ({ settings: { serverBaseUrl: "http://tracker.example", mockMode: false }, sdk: {
  GetMangaTrackers: vi.fn(), SearchTracker: vi.fn(), BindTrackerWork: vi.fn(), UpdateTrack: vi.fn(), UnbindTrack: vi.fn(), TrackProgress: vi.fn(), RefreshTrackerRecord: vi.fn(),
} }));
vi.mock("../graphql/client", () => ({ createGraphqlClient: vi.fn(() => mocks.sdk) }));
vi.mock("../../stores/useSettingsStore", () => ({ useSettingsStore: { getState: () => mocks.settings } }));
vi.mock("./progressStorage", () => ({ getProgressHeads: vi.fn(), getProgressOperations: vi.fn(), getPendingTracking: vi.fn(), recordTrackingResult: vi.fn(), suppressEarlierTracking: vi.fn() }));
vi.mock("./progressSync", () => ({ synchronizeProgress: vi.fn() }));
vi.mock("./trackingCoordination", () => ({ withTrackingLock: (_backend: unknown, work: (owner: string) => unknown) => work("owner") }));
const backend = progressBackend("http://tracker.example");
const record = (overrides = {}): BoundTrackerRecord => ({ id: 501, trackerId: 1, mangaId: 42, remoteId: "9007199254740993", title: "Selected work", lastChapterRead: 1, totalChapters: 20, score: 9, displayScore: "9", status: 1, remoteUrl: "https://tracker.example/work/42", private: false, ...overrides });
const work = (overrides = {}): TrackerSearchResult => ({ id: 7, trackerId: 1, remoteId: "9007199254740993", title: "Selected work", totalChapters: 20, lastChapterRead: 0, coverUrl: "", summary: "", trackingUrl: "https://tracker.example/work/42", private: true, publishingStatus: "Ongoing", publishingType: "Manga", ...overrides });
let records: BoundTrackerRecord[];
let highest: number;
let trackers: { id: number; name: string; isLoggedIn: boolean; isTokenExpired: boolean; supportsPrivateTracking: boolean; scores: string[]; statuses: { value: number; name: string }[] }[];
beforeEach(() => {
  vi.resetAllMocks(); mocks.settings.serverBaseUrl = backend.serverBaseUrl; mocks.settings.mockMode = false; records = [record()]; highest = 3;
  trackers = [{ id: 1, name: "First tracker", isLoggedIn: true, isTokenExpired: false, supportsPrivateTracking: true, scores: ["10", "9"], statuses: [{ value: 1, name: "Reading" }, { value: 2, name: "Completed" }] }];
  vi.mocked(getProgressHeads).mockResolvedValue([]); vi.mocked(suppressEarlierTracking).mockResolvedValue();
  vi.mocked(getProgressOperations).mockResolvedValue([]); vi.mocked(getPendingTracking).mockResolvedValue([]); vi.mocked(recordTrackingResult).mockResolvedValue();
  mocks.sdk.GetMangaTrackers.mockImplementation(async () => ({ manga: { id: 42, title: "Fixture", trackRecords: { nodes: structuredClone(records) } }, trackers: { nodes: structuredClone(trackers) }, chapters: { nodes: [{ chapterNumber: highest }] } }));
  mocks.sdk.SearchTracker.mockResolvedValue({ searchTracker: { trackSearches: [work(), work({ trackerId: 2 })] } });
  mocks.sdk.BindTrackerWork.mockImplementation(async ({ input }) => {
    const linked = record({ trackerId: input.trackerId, remoteId: input.remoteId, private: input.private ?? false }); records.push(linked); return { bindTrack: { trackRecord: structuredClone(linked) } };
  });
  mocks.sdk.UpdateTrack.mockImplementation(async ({ input }) => {
    const linked = records.find((item) => item.id === input.recordId)!;
    Object.assign(linked, { ...(input.lastChapterRead != null ? { lastChapterRead: input.lastChapterRead } : {}), ...(input.status != null ? { status: input.status } : {}), ...(input.private != null ? { private: input.private } : {}), ...(input.scoreString != null ? { score: Number(input.scoreString), displayScore: input.scoreString } : {}) });
    return { updateTrack: { trackRecord: structuredClone(linked) } };
  });
  mocks.sdk.UnbindTrack.mockImplementation(async ({ input }) => { records = records.filter((item) => item.id !== input.recordId); return { unbindTrack: { trackRecord: null } }; });
  mocks.sdk.TrackProgress.mockImplementation(async () => { records.forEach((item) => { item.lastChapterRead = highest; }); return { trackProgress: { trackRecords: structuredClone(records) } }; });
  mocks.sdk.RefreshTrackerRecord.mockImplementation(async ({ input }) => ({ fetchTrack: { trackRecord: structuredClone(records.find((item) => item.id === input.recordId)) } }));
});

describe("tracker search and binding", () => {
  it("searches the selected provider and never uses progress push for linking", async () => {
    expect(await searchTrackerWorks(backend, 42, 1, "  Fixture  ")).toEqual([work()]);
    expect(mocks.sdk.SearchTracker).toHaveBeenCalledWith({ input: { trackerId: 1, query: "Fixture" } });
    expect(mocks.sdk.TrackProgress).not.toHaveBeenCalled();
  });
  it("preserves a large remote ID and the selected private binding", async () => {
    records = [];
    const linked = await bindTrackerWork(backend, 42, 1, work());
    expect(linked.remoteId).toBe("9007199254740993"); expect(linked.private).toBe(true);
    expect(mocks.sdk.BindTrackerWork).toHaveBeenCalledWith({ input: { mangaId: 42, trackerId: 1, remoteId: "9007199254740993", private: true } });
  });
  it("rejects another provider's result and a binding changed in another view", async () => {
    await expect(bindTrackerWork(backend, 42, 1, work({ trackerId: 2 }))).rejects.toThrow("selected tracker");
    await expect(bindTrackerWork(backend, 42, 1, work({ remoteId: "different" }))).rejects.toThrow("another work");
    expect(mocks.sdk.BindTrackerWork).not.toHaveBeenCalled();
  });
  it("ignores a stale search after the backend changes", async () => {
    mocks.sdk.SearchTracker.mockImplementation(async () => { mocks.settings.serverBaseUrl = "http://other.example"; return { searchTracker: { trackSearches: [work()] } }; });
    await expect(searchTrackerWorks(backend, 42, 1, "Fixture")).rejects.toThrow("server changed");
  });
  it("does not claim binding success from an unconfirmed work or privacy", async () => {
    records = []; mocks.sdk.BindTrackerWork.mockResolvedValue({ bindTrack: { trackRecord: record({ private: false }) } });
    await expect(bindTrackerWork(backend, 42, 1, work())).rejects.toThrow("not confirm");
  });
});

describe("manual tracker edits", () => {
  it("does not overwrite progress changed after an edit opened", async () => {
    const initial = record(); records[0].lastChapterRead = 3;
    await expect(editTrackerRecord(backend, 42, initial, { lastChapterRead: 0 })).rejects.toThrow("changed while");
    expect(mocks.sdk.UpdateTrack).not.toHaveBeenCalled();
  });
  it("allows score zero without changing newer progress", async () => {
    const initial = record(); records[0].lastChapterRead = 3;
    const updated = await editTrackerRecord(backend, 42, initial, { scoreString: "0" });
    expect(updated).toMatchObject({ score: 0, lastChapterRead: 3 });
    expect(mocks.sdk.UpdateTrack).toHaveBeenCalledWith({ input: { recordId: 501, scoreString: "0" } });
  });
  it("refreshes remote progress before a score edit so the backend cannot overwrite a stale cached value", async () => {
    mocks.sdk.RefreshTrackerRecord.mockImplementationOnce(async () => { records[0].lastChapterRead = 3; return { fetchTrack: { trackRecord: structuredClone(records[0]) } }; });
    const updated = await editTrackerRecord(backend, 42, record(), { scoreString: "0" });
    expect(updated).toMatchObject({ score: 0, lastChapterRead: 3 });
  });
  it("persists a manual position override before sending the provider edit", async () => {
    const earlier = [{ entityKey: "captured", sequence: 12, chapter: { mangaId: 42 } }] as any;
    vi.mocked(getProgressHeads).mockResolvedValue(earlier);
    await editTrackerRecord(backend, 42, record(), { lastChapterRead: 0 });
    expect(suppressEarlierTracking).toHaveBeenCalledWith(backend, earlier);
    expect(vi.mocked(suppressEarlierTracking).mock.invocationCallOrder[0]).toBeLessThan(mocks.sdk.UpdateTrack.mock.invocationCallOrder[0]);
  });
  it("sends no provider position edit if its local override barrier cannot be saved", async () => {
    vi.mocked(getProgressHeads).mockResolvedValue([{ chapter: { mangaId: 42 } }] as any);
    vi.mocked(suppressEarlierTracking).mockRejectedValue(new Error("storage failed"));
    await expect(editTrackerRecord(backend, 42, record(), { lastChapterRead: 0 })).rejects.toThrow("Restore local progress storage");
    expect(mocks.sdk.UpdateTrack).not.toHaveBeenCalled();
  });
  it("does not claim an ignored edit was saved or suppress its retry ordering", async () => {
    mocks.sdk.UpdateTrack.mockResolvedValue({ updateTrack: { trackRecord: record() } });
    await expect(editTrackerRecord(backend, 42, record(), { scoreString: "0" })).rejects.toThrow("not confirmed");
    expect(suppressEarlierTracking).not.toHaveBeenCalled();
  });
  it("unlinks only the reviewed local binding and leaves the remote entry intact", async () => {
    await unlinkTrackerRecord(backend, 42, record());
    expect(mocks.sdk.UnbindTrack).toHaveBeenCalledWith({ input: { recordId: 501, deleteRemoteTrack: false } }); expect(records).toEqual([]);
  });
});

describe("verified tracker synchronization", () => {
  it("verifies each provider record after requesting backend progress synchronization", async () => {
    expect(await pushLinkedTrackerProgress(backend, 42, { mangaTitle: "Fixture" })).toEqual({ skipped: false, confirmed: 1 });
    expect(mocks.sdk.TrackProgress).toHaveBeenCalledWith({ input: { mangaId: 42 } });
    expect(mocks.sdk.RefreshTrackerRecord).toHaveBeenCalledWith({ input: { recordId: 501 } });
  });
  it("retains failure when HTTP success hides a stale provider position", async () => {
    mocks.sdk.RefreshTrackerRecord.mockResolvedValue({ fetchTrack: { trackRecord: record() } });
    await expect(pushLinkedTrackerProgress(backend, 42)).rejects.toThrow("not confirmed");
  });
  it("rechecks cancellation after metadata arrives before sending a provider update", async () => {
    const allowed = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(pushLinkedTrackerProgress(backend, 42, { shouldProceed: allowed })).resolves.toMatchObject({ deferred: true });
    expect(mocks.sdk.TrackProgress).not.toHaveBeenCalled();
  });
  it("accepts confirmed fractional chapter positions without truncation", async () => {
    highest = 2.5;
    await expect(pushLinkedTrackerProgress(backend, 42)).resolves.toMatchObject({ confirmed: 1 });
  });
  it.each([0, -1, NaN])("skips ineligible chapter positions (%s)", async (chapterNumber) => {
    highest = chapterNumber;
    await expect(pushLinkedTrackerProgress(backend, 42)).resolves.toMatchObject({ skipped: true });
    expect(mocks.sdk.TrackProgress).not.toHaveBeenCalled();
  });
  it("keeps expired authentication actionable without sending a provider update", async () => {
    trackers[0].isTokenExpired = true;
    await expect(pushLinkedTrackerProgress(backend, 42)).rejects.toThrow("Sign in");
    expect(mocks.sdk.TrackProgress).not.toHaveBeenCalled();
  });
  it("does not report total success when only one linked provider confirms", async () => {
    trackers.push({ ...trackers[0], id: 2, name: "Second tracker", isLoggedIn: false }); records.push(record({ id: 502, trackerId: 2 }));
    await expect(pushLinkedTrackerProgress(backend, 42)).rejects.toThrow("Second tracker: sign in");
    expect(mocks.sdk.RefreshTrackerRecord).toHaveBeenCalledTimes(1);
  });
  it("skips an unbound title and rejects a reused manga identity", async () => {
    await expect(pushLinkedTrackerProgress(backend, 42, { mangaTitle: "Replaced title" })).rejects.toThrow("title changed");
    records = []; await expect(pushLinkedTrackerProgress(backend, 42)).resolves.toMatchObject({ skipped: true });
  });
  it("clears an existing durable retry only after a successful manual synchronization", async () => {
    const requests = [{ chapter: { mangaId: 42 }, trackingDueSequence: 12 }] as any;
    vi.mocked(getPendingTracking).mockResolvedValue(requests);
    await synchronizeLinkedTrackersNow(backend, 42);
    expect(recordTrackingResult).toHaveBeenCalledWith(backend, requests, "owner");
  });
  it("permits only HTTP(S) tracker links", () => {
    expect(trackerExternalUrl("https://tracker.example/work/42")).toBe("https://tracker.example/work/42");
    expect(trackerExternalUrl("javascript:alert(1)")).toBeUndefined(); expect(trackerExternalUrl("not a url")).toBeUndefined();
  });
});
