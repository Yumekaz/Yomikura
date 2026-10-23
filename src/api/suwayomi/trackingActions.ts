import { createGraphqlClient } from "../graphql/client";
import type { SearchTrackerQuery, TrackerRecordFieldsFragment, UpdateTrackInput } from "../graphql/generated/graphql";
import { progressBackend, type ProgressBackend } from "./backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getProgressHeads, getProgressOperations, suppressEarlierTracking } from "./progressStorage";
import { withTrackingLock } from "./trackingCoordination";
import { synchronizeProgress } from "./progressSync";

export type TrackerSearchResult = SearchTrackerQuery["searchTracker"]["trackSearches"][number];
export type BoundTrackerRecord = TrackerRecordFieldsFragment;
export function assertTrackingBackend(backend: ProgressBackend) {
  const settings = useSettingsStore.getState();
  if (progressBackend(settings.serverBaseUrl, settings.mockMode).key !== backend.key) throw new Error("The selected server changed. Reopen tracking on the intended server.");
}
const sdkFor = (backend: ProgressBackend) => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live");
export function trackerExternalUrl(value: string | null | undefined, base?: string) {
  if (!value) return undefined;
  try { const url = new URL(value, base); return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined; } catch { return undefined; }
}
function sameRemote(a: unknown, b: unknown) { return a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b); }
function matchesRecord(record: BoundTrackerRecord | null | undefined, expected: Pick<BoundTrackerRecord, "id" | "mangaId" | "trackerId" | "remoteId">) {
  return !!record && record.id === expected.id && record.mangaId === expected.mangaId && record.trackerId === expected.trackerId && sameRemote(record.remoteId, expected.remoteId);
}
async function stateFor(backend: ProgressBackend, mangaId: number) {
  assertTrackingBackend(backend);
  const data = await sdkFor(backend).GetMangaTrackers({ mangaId });
  assertTrackingBackend(backend);
  if (data.manga?.id !== mangaId) throw new Error("The title's tracker records could not be confirmed.");
  if (data.manga.trackRecords.nodes.some((record) => record.mangaId !== mangaId)) throw new Error("The tracker response contains records from another title.");
  return data;
}
function requireTracker(data: Awaited<ReturnType<typeof stateFor>>, trackerId: number) {
  const tracker = data.trackers.nodes.find((item) => item.id === trackerId);
  if (!tracker?.isLoggedIn || tracker.isTokenExpired) throw new Error(`Sign in to ${tracker?.name ?? "the selected tracker"} before continuing.`);
  return tracker;
}

export async function searchTrackerWorks(backend: ProgressBackend, mangaId: number, trackerId: number, query: string) {
  if (!query.trim()) throw new Error("Enter a title to search.");
  const data = await stateFor(backend, mangaId); requireTracker(data, trackerId);
  const response = await sdkFor(backend).SearchTracker({ input: { trackerId, query: query.trim() } });
  assertTrackingBackend(backend);
  return response.searchTracker.trackSearches.filter((item) => item.trackerId === trackerId);
}

export async function bindTrackerWork(backend: ProgressBackend, mangaId: number, trackerId: number, result: TrackerSearchResult, privateTrack = result.private) {
  return withTrackingLock(backend, async () => {
  if (result.trackerId !== trackerId || result.remoteId === undefined || result.remoteId === null || !String(result.remoteId).trim()) throw new Error("Choose a search result from the selected tracker.");
  const data = await stateFor(backend, mangaId);
  const tracker = requireTracker(data, trackerId);
  const existing = data.manga.trackRecords.nodes.find((record) => record.trackerId === trackerId);
  if (existing) {
    if (sameRemote(existing.remoteId, result.remoteId) && (!tracker.supportsPrivateTracking || existing.private === privateTrack)) return existing;
    throw new Error("This tracker was linked to another work while you were reviewing. Refresh its current record first.");
  }
  const response = await sdkFor(backend).BindTrackerWork({ input: { mangaId, trackerId, remoteId: result.remoteId, ...(tracker.supportsPrivateTracking ? { private: privateTrack } : {}) } });
  assertTrackingBackend(backend);
  const record = response.bindTrack?.trackRecord;
  if (!record || record.mangaId !== mangaId || record.trackerId !== trackerId || !sameRemote(record.remoteId, result.remoteId) || tracker.supportsPrivateTracking && record.private !== privateTrack) throw new Error("Suwayomi did not confirm the selected tracker binding and privacy. Refresh the tracker record before retrying.");
  return record;
  });
}

export async function editTrackerRecord(backend: ProgressBackend, mangaId: number, expected: BoundTrackerRecord, patch: Omit<UpdateTrackInput, "recordId">) {
  return withTrackingLock(backend, async () => {
  const data = await stateFor(backend, mangaId); const tracker = requireTracker(data, expected.trackerId);
  const current = data.manga.trackRecords.nodes.find((record) => record.id === expected.id);
  if (!matchesRecord(current, expected)) throw new Error("The linked work changed. Refresh its record before editing.");
  if (patch.lastChapterRead !== undefined && patch.lastChapterRead !== null && (!Number.isFinite(patch.lastChapterRead) || patch.lastChapterRead < 0)) throw new Error("Enter a valid chapter number of zero or greater.");
  if (patch.status !== undefined && patch.status !== null && !tracker.statuses.some((status) => status.value === patch.status)) throw new Error("Choose a status supported by this tracker.");
  if (patch.scoreString !== undefined && patch.scoreString !== null && patch.scoreString !== "0" && !tracker.scores.includes(patch.scoreString)) throw new Error("Choose a score supported by this tracker.");
  if (patch.private != null && !tracker.supportsPrivateTracking) throw new Error("This tracker does not support private entries.");
  if (patch.lastChapterRead != null && current!.lastChapterRead !== expected.lastChapterRead && current!.lastChapterRead !== patch.lastChapterRead
    || patch.status != null && current!.status !== expected.status && current!.status !== patch.status
    || patch.scoreString != null && current!.displayScore !== expected.displayScore && current!.displayScore !== patch.scoreString
    || patch.private != null && current!.private !== expected.private && current!.private !== patch.private) throw new Error("The tracker changed while this edit was open. Refresh it before applying the edit.");
  const earlier = patch.lastChapterRead != null ? (await getProgressHeads(backend)).filter((head) => head.chapter.mangaId === mangaId) : [];
  assertTrackingBackend(backend);
  const response = await sdkFor(backend).UpdateTrack({ input: { ...patch, recordId: expected.id } });
  assertTrackingBackend(backend);
  const record = response.updateTrack?.trackRecord;
  const scoreConfirmed = patch.scoreString == null || !!record && (patch.scoreString === "0" ? record.score === 0
    : record.displayScore === patch.scoreString || Number.isFinite(Number(patch.scoreString)) && record.score === Number(patch.scoreString));
  if (!matchesRecord(record, expected) || !scoreConfirmed || patch.lastChapterRead != null && record!.lastChapterRead !== patch.lastChapterRead || patch.status != null && record!.status !== patch.status || patch.private != null && record!.private !== patch.private) throw new Error("The requested tracker edit was not confirmed. Refresh its record before retrying.");
  if (earlier.length) {
    try { await suppressEarlierTracking(backend, earlier); }
    catch { throw new Error("The tracker edit was confirmed, but older automatic retries could not be dismissed on this device. Review pending tracker synchronization before continuing."); }
  }
  return record!;
  });
}

export async function unlinkTrackerRecord(backend: ProgressBackend, mangaId: number, expected: BoundTrackerRecord) {
  return withTrackingLock(backend, async () => {
  const data = await stateFor(backend, mangaId);
  const current = data.manga.trackRecords.nodes.find((record) => record.id === expected.id);
  if (!current) return;
  if (!matchesRecord(current, expected)) throw new Error("The linked work changed. Refresh its record before unlinking.");
  await sdkFor(backend).UnbindTrack({ input: { recordId: expected.id, deleteRemoteTrack: false } });
  assertTrackingBackend(backend);
  const confirmed = await stateFor(backend, mangaId);
  if (confirmed.manga.trackRecords.nodes.some((record) => record.id === expected.id)) throw new Error("Unlinking was not confirmed. Refresh the record before retrying.");
  });
}

/** TrackProgress can return stale records after swallowing a provider error; refresh each binding. */
export async function pushLinkedTrackerProgress(backend: ProgressBackend, mangaId: number, options: { mangaTitle?: string; manual?: boolean; shouldProceed?: () => Promise<boolean> } = {}) {
  if (options.shouldProceed && !await options.shouldProceed()) return { skipped: false, confirmed: 0, deferred: true };
  const data = await stateFor(backend, mangaId);
  const records = data.manga.trackRecords.nodes;
  if (!records.length) return { skipped: true, confirmed: 0 };
  if (options.mangaTitle !== undefined && data.manga.title !== options.mangaTitle) throw new Error("The title changed. Reopen its chapter before retrying tracker synchronization.");
  const highest = data.chapters?.nodes[0]?.chapterNumber ?? 0;
  const required = Number.isFinite(highest) && highest > 0 ? highest : 0;
  if (!required && !options.manual) return { skipped: true, confirmed: 0 };
  const sdk = sdkFor(backend);
  const available = records.filter((record) => data.trackers.nodes.some((tracker) => tracker.id === record.trackerId && tracker.isLoggedIn && !tracker.isTokenExpired));
  if (!available.length) throw new Error("Sign in to the linked trackers to synchronize saved progress.");
  if (required > 0) {
    if (options.shouldProceed && !await options.shouldProceed()) return { skipped: false, confirmed: 0, deferred: true };
    assertTrackingBackend(backend);
    const response = await sdk.TrackProgress({ input: { mangaId } });
    assertTrackingBackend(backend);
    if (!response.trackProgress) throw new Error("Suwayomi did not confirm a tracker update.");
  }
  const failures: string[] = [];
  for (const record of records) {
    const tracker = data.trackers.nodes.find((item) => item.id === record.trackerId);
    if (!available.includes(record)) { failures.push(`${tracker?.name ?? "Linked tracker"}: sign in again.`); continue; }
    try {
      assertTrackingBackend(backend);
      const refreshed = await sdk.RefreshTrackerRecord({ input: { recordId: record.id } });
      assertTrackingBackend(backend);
      const confirmed = refreshed.fetchTrack?.trackRecord;
      if (!matchesRecord(confirmed, record) || !Number.isFinite(confirmed!.lastChapterRead) || confirmed!.lastChapterRead < required) throw new Error("The provider has not confirmed the completed chapter position.");
    } catch (error) { failures.push(`${tracker?.name ?? "Linked tracker"}: ${error instanceof Error ? error.message : "Progress could not be verified."}`); }
  }
  assertTrackingBackend(backend);
  if (failures.length) throw new Error(failures.join(" "));
  return { skipped: false, confirmed: records.length };
}

export async function synchronizeLinkedTrackersNow(backend: ProgressBackend, mangaId: number) {
  await synchronizeProgress(backend);
  if ((await getProgressOperations(backend)).some((operation) => operation.chapter.mangaId === mangaId)) throw new Error("Reading progress is still waiting for Suwayomi. Synchronize it before updating linked trackers.");
  return withTrackingLock(backend, () => pushLinkedTrackerProgress(backend, mangaId, { manual: true }));
}
