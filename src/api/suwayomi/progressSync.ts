import { createGraphqlClient } from "../graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { chapterIdentityMatches, progressBackend, type ChapterProgressIdentity, type ProgressBackend } from "./backendIdentity";
import { deleteCachedChapter, getCachedChapter, getReadingHistory, hideReadingHistoryItem, recordReadingActivity, saveCachedChapter, type CachedChapter } from "./offlineCache";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getProgressHead, getProgressHeads, getProgressOperations, markProgressOperation, observeChapterProgress, progressChanged, releaseProgressLease, type ProgressHead, type ProgressIntent, type ProgressOperation, type ProgressPatch } from "./progressStorage";

type RemoteChapter = { id: number; name: string; chapterNumber: number; mangaId: number; sourceOrder: number; pageCount: number; isRead: boolean; lastPageRead: number; manga?: { title: string } | null };
const inFlight = new Map<string, { promise: Promise<void>; rerun: boolean }>();

export function isCurrentProgressBackend(backend: ProgressBackend) {
  try {
    const settings = useSettingsStore.getState();
    return progressBackend(settings.serverBaseUrl, settings.mockMode).key === backend.key;
  } catch { return false; }
}

export function progressChapterIdentity(chapter: RemoteChapter): ChapterProgressIdentity {
  return { chapterId: chapter.id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.manga?.title ?? "Unknown Manga", sourceOrder: chapter.sourceOrder, pageCount: chapter.pageCount };
}

export function cachedIdentity(chapter: CachedChapter): ChapterProgressIdentity {
  return { chapterId: chapter.id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.mangaTitle, sourceOrder: chapter.sourceOrder, pageCount: chapter.pageCount };
}

function client(backend: ProgressBackend) {
  return createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal: AbortSignal.timeout(15_000) }, backend.isDemo ? "demo" : "live");
}

async function mirrorProgress(head: ProgressHead) {
  const { backend, chapter, patch } = head;
  // Demo history/progress lives in its own heads. Never alter a live cache/history row with an overlapping ID.
  if (backend.isDemo) return;
  const cached = await getCachedChapter(backend.serverBaseUrl, chapter.chapterId, backend.isDemo);
  if (cached && chapterIdentityMatches(chapter, cachedIdentity(cached))) await saveCachedChapter({ ...cached, lastPageRead: patch.lastPageRead, isRead: patch.isRead });
  const existing = (await getReadingHistory(backend.serverBaseUrl)).find((item) => item.chapterId === chapter.chapterId && !!item.isDemo === backend.isDemo);
  if (!head.hasActivity && !existing) return;
  const event = { chapterId: chapter.chapterId, chapterName: chapter.chapterName, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.mangaTitle, lastPageRead: patch.lastPageRead, pageCount: chapter.pageCount, isRead: patch.isRead, isDemo: backend.isDemo, readAt: head.activityAt ?? existing?.readAt, isHidden: head.hideHistory };
  if (head.hideHistory) await hideReadingHistoryItem(event, backend.serverBaseUrl);
  else await recordReadingActivity(backend.serverBaseUrl, event);
}

/** The outbox/head transaction is authoritative; legacy caches are derived views. */
export async function saveProgressIntent(backend: ProgressBackend, intent: ProgressIntent) {
  const result = await enqueueProgress(backend, intent);
  if (result.accepted) {
    await mirrorProgress(result.head).catch((error) => console.warn("Progress is retained; its cached view could not be refreshed.", error));
    progressChanged(backend, "queued");
  }
  return result;
}

export async function projectChapterProgress<T extends RemoteChapter>(backend: ProgressBackend, chapter: T, options: { offline?: boolean; observedVersion?: string } = {}) {
  const observation = options.offline || backend.isDemo ? { head: await getProgressHead(backend, chapter.id).catch(() => undefined), stale: false }
    : await observeChapterProgress(backend, progressChapterIdentity(chapter), { isRead: chapter.isRead, lastPageRead: chapter.lastPageRead }, options.observedVersion).catch(() => ({ head: undefined, stale: false }));
  const head = observation.head;
  const matches = head && chapterIdentityMatches(head.chapter, progressChapterIdentity(chapter));
  if (observation.stale && head && !matches) throw new Error("The chapter changed while loading. Retry the reader.");
  const pending = head && (backend.isDemo || options.offline || observation.stale || head.sequence > head.acknowledgedSequence) && matches;
  return { ...chapter, ...(pending ? { isRead: head.patch.isRead, lastPageRead: backend.isDemo || options.offline || head.dirtyFields?.includes("lastPageRead") || observation.stale && head.sequence <= head.acknowledgedSequence ? head.patch.lastPageRead : chapter.lastPageRead } : {}), progressEpoch: head?.epoch ?? 0,
    progressBaseline: pending ? head.lastAcknowledged ?? head.baseline : { isRead: chapter.isRead, lastPageRead: chapter.lastPageRead },
  };
}

function sameState(a: { isRead: boolean; lastPageRead: number } | undefined, b: { isRead: boolean; lastPageRead: number } | undefined) {
  return !!a && !!b && a.isRead === b.isRead && a.lastPageRead === b.lastPageRead;
}

async function sendOperation(backend: ProgressBackend, operation: ProgressOperation, owner: string) {
  if (!await markProgressOperation(operation, owner, "sending")) return;
  const remote = (await client(backend).GetChapter({ id: operation.chapter.chapterId })).chapter;
  if (!chapterIdentityMatches(operation.chapter, progressChapterIdentity(remote))) {
    await markProgressOperation(operation, owner, "blocked", "This chapter no longer matches its saved copy. Open the chapter and review its progress before trying again.");
    progressChanged(backend, "error");
    return;
  }
  if (!isCurrentProgressBackend(backend)) {
    await markProgressOperation(operation, owner, "pending");
    return;
  }
  const head = await getProgressHead(backend, operation.chapter.chapterId);
  const state = { isRead: remote.isRead, lastPageRead: remote.lastPageRead };
  // Exact explicit actions are user intent. Automatic writes pause on competing server edits.
  if (operation.kind === "reading" && !sameState(state, head?.lastAcknowledged ?? head?.baseline ?? operation.baseline) && !sameState(state, operation.patch)) {
    await markProgressOperation(operation, owner, "blocked", "Reading progress changed on the server. Open this chapter to review it, or use an explicit read/unread action.");
    progressChanged(backend, "error");
    return;
  }
  const patch = Object.fromEntries((operation.fields ?? ["isRead", "lastPageRead"]).map((field) => [field, operation.patch[field]])) as Partial<ProgressPatch>;
  if (operation.kind === "reading") patch.isRead = operation.patch.isRead || remote.isRead;
  const response = await client(backend).UpdateChapterProgress({ input: { id: operation.chapter.chapterId, patch } });
  const acknowledged = response.updateChapter?.chapter;
  if (!acknowledged || acknowledged.id !== operation.chapter.chapterId || (patch.lastPageRead !== undefined && acknowledged.lastPageRead !== patch.lastPageRead) || (patch.isRead !== undefined && acknowledged.isRead !== patch.isRead)) {
    throw new Error("Suwayomi did not confirm the saved progress.");
  }
  if (!await acknowledgeProgress(operation, owner, { ...operation.patch, isRead: acknowledged.isRead, lastPageRead: acknowledged.lastPageRead })) return;
  if (isCurrentProgressBackend(backend)) useSettingsStore.setState({ connectionStatus: "connected", errorMessage: "" });
  progressChanged(backend);
  const latest = await getProgressHead(backend, operation.chapter.chapterId);
  if (latest) await mirrorProgress(latest).catch(() => undefined);
  if (operation.deleteAfterAck && latest?.epoch === operation.epoch && latest.patch.isRead && isCurrentProgressBackend(backend)) {
    // Capture the backend for both operations; deleteChapter() in the UI store resolves the current profile.
    try {
      await client(backend).DeleteDownloadedChapter({ input: { id: operation.chapter.chapterId } });
      await deleteCachedChapter(backend.serverBaseUrl, operation.chapter.chapterId, backend.isDemo);
      progressChanged(backend);
    } catch (error) { console.warn("Progress synchronized; automatic download removal did not finish.", error); }
  }
}

async function drain(backend: ProgressBackend, exclusiveBrowserLock = false) {
  const owner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  if (!await acquireProgressLease(backend, owner, exclusiveBrowserLock)) return;
  const renew = window.setInterval(() => { void acquireProgressLease(backend, owner).catch(() => undefined); }, 10_000);
  try {
    while (isCurrentProgressBackend(backend)) {
      const operation = (await getProgressOperations(backend)).find((item) => item.status !== "blocked");
      if (!operation) break;
      if (backend.isDemo) {
        await acknowledgeProgress(operation, owner, operation.patch);
        progressChanged(backend);
      } else {
        try { await sendOperation(backend, operation, owner); }
        catch {
          await markProgressOperation(operation, owner, "pending", "Saved on this device. Waiting to synchronize with Suwayomi.");
          progressChanged(backend, "error");
          return;
        }
      }
      if (!await acquireProgressLease(backend, owner)) return;
    }
  } finally {
    window.clearInterval(renew);
    await releaseProgressLease(backend, owner);
  }
}

export function synchronizeProgress(backend: ProgressBackend): Promise<void> {
  const running = inFlight.get(backend.key);
  if (running) { running.rerun = true; return running.promise; }
  const task = { promise: Promise.resolve(), rerun: false };
  const job = (async () => {
    do {
      task.rerun = false;
      if (navigator.locks) await navigator.locks.request(`yomikura-progress:${backend.key}`, () => drain(backend, true));
      else await drain(backend);
    } while (task.rerun && isCurrentProgressBackend(backend));
  })();
  task.promise = job;
  inFlight.set(backend.key, task);
  void job.finally(() => { if (inFlight.get(backend.key) === task) inFlight.delete(backend.key); }).catch(() => undefined);
  return job;
}

export async function writeChapterProgress(backend: ProgressBackend, chapterId: number, patch: Partial<ProgressPatch>, options: { requireAcknowledgment?: boolean; hideHistory?: boolean; fallback?: ChapterProgressIdentity } = {}) {
  let chapter: ChapterProgressIdentity;
  let baseline: ProgressIntent["baseline"];
  const cached = await getCachedChapter(backend.serverBaseUrl, chapterId, backend.isDemo);
  const existingHead = await getProgressHead(backend, chapterId);
  const known = options.fallback ?? (cached ? cachedIdentity(cached) : existingHead?.chapter);
  if (known) {
    chapter = known;
    baseline = existingHead?.lastAcknowledged ?? existingHead?.baseline ?? { isRead: cached?.isRead ?? false, lastPageRead: cached?.lastPageRead ?? 0 };
  } else try {
    const remote = (await client(backend).GetChapter({ id: chapterId })).chapter;
    chapter = progressChapterIdentity(remote);
    baseline = { isRead: remote.isRead, lastPageRead: remote.lastPageRead };
  } catch {
    const cached = await getCachedChapter(backend.serverBaseUrl, chapterId, backend.isDemo);
    const head = await getProgressHead(backend, chapterId);
    const fallback = cached ? cachedIdentity(cached) : options.fallback ?? head?.chapter;
    if (!fallback) throw new Error("The chapter could not be identified. Open or save it before changing progress offline.");
    chapter = fallback;
    baseline = head?.lastAcknowledged ?? head?.baseline ?? { isRead: cached?.isRead ?? false, lastPageRead: cached?.lastPageRead ?? 0 };
  }
  const { head } = await saveProgressIntent(backend, { kind: "explicit", chapter, baseline, patch, hideHistory: options.hideHistory });
  await synchronizeProgress(backend);
  const acknowledged = (await getProgressHead(backend, chapterId))!.acknowledgedSequence >= head.sequence;
  if (!acknowledged && options.requireAcknowledgment) throw new Error("The progress change is saved on this device but has not been confirmed by Suwayomi. The operation was paused before removing the original title.");
  return { acknowledged };
}

export async function getPendingHistory(backend: ProgressBackend) {
  return (await getProgressHeads(backend)).filter((head) => head.sequence > head.acknowledgedSequence);
}

export async function resolveProgressConflict(backend: ProgressBackend, chapterId: number, useSaved: boolean, expectedSequence?: number) {
  const head = await getProgressHead(backend, chapterId);
  if (!head || head.sequence <= head.acknowledgedSequence) return;
  if (expectedSequence !== undefined && head.sequence !== expectedSequence) throw new Error("Progress changed while you were reviewing it. Review the current change and try again.");
  const remote = (await client(backend).GetChapter({ id: chapterId })).chapter;
  if (useSaved && !chapterIdentityMatches(head.chapter, progressChapterIdentity(remote))) throw new Error("This saved change belongs to a different chapter. Keep the server's progress instead.");
  const baseline = { isRead: remote.isRead, lastPageRead: remote.lastPageRead };
  const saved = await saveProgressIntent(backend, { kind: "explicit", chapter: progressChapterIdentity(remote), baseline, expectedSequence: head.sequence,
    patch: useSaved ? head.patch : baseline, hideHistory: useSaved && head.hideHistory,
    trackCompletion: useSaved && head.lastKind === "reading" && head.patch.isRead && !head.baseline.isRead,
  });
  if (!saved.accepted) throw new Error("Progress changed while you were reviewing it. Review the current change and try again.");
  await synchronizeProgress(backend);
}

export async function readProgressHistory(backend: ProgressBackend) {
  const events = await getReadingHistory(backend.serverBaseUrl);
  const heads = await getProgressHeads(backend);
  for (const head of heads) {
    const index = events.findIndex((event) => event.chapterId === head.chapter.chapterId && (event.isDemo ?? event.mangaTitle.startsWith("[Demo]")) === backend.isDemo);
    if (head.sequence <= head.acknowledgedSequence && index >= 0 && !head.hideHistory && (head.activityAt ?? 0) < events[index].readAt) continue;
    if (!head.hasActivity && index < 0 && !head.hideHistory) continue;
    const event = { ...(index >= 0 ? events[index] : {}), historyKey: head.entityKey, serverBaseUrl: backend.serverBaseUrl,
      chapterId: head.chapter.chapterId, chapterName: head.chapter.chapterName, chapterNumber: head.chapter.chapterNumber,
      mangaId: head.chapter.mangaId, mangaTitle: head.chapter.mangaTitle, pageCount: head.chapter.pageCount,
      lastPageRead: head.patch.lastPageRead, isRead: head.patch.isRead, isDemo: backend.isDemo, isHidden: head.hideHistory,
      readAt: head.activityAt ?? (index >= 0 ? events[index].readAt : head.updatedAt),
    };
    if (index >= 0) events[index] = event; else events.push(event);
  }
  return events;
}
