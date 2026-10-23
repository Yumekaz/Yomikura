import { createGraphqlClient } from "../graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { chapterIdentityMatches, progressBackend, type ChapterProgressIdentity, type ProgressBackend } from "./backendIdentity";
import { deleteCachedChapter, getCachedChapter, getReadingHistory, hideReadingHistoryItem, recordReadingActivity, saveCachedChapter, type CachedChapter } from "./offlineCache";
import { acknowledgeProgress, acquireProgressLease, enqueueProgress, getProgressHead, getProgressHeads, getProgressOperations, markProgressOperation, progressChanged, releaseProgressLease, type ProgressHead, type ProgressIntent, type ProgressOperation, type ProgressPatch } from "./progressStorage";

type RemoteChapter = { id: number; name: string; chapterNumber: number; mangaId: number; sourceOrder: number; pageCount: number; isRead: boolean; lastPageRead: number; manga?: { title: string } | null };
const inFlight = new Map<string, Promise<void>>();

export function isCurrentProgressBackend(backend: ProgressBackend) {
  try {
    const settings = useSettingsStore.getState();
    return progressBackend(settings.serverBaseUrl, settings.mockMode).key === backend.key;
  } catch { return false; }
}

export function progressChapterIdentity(chapter: RemoteChapter): ChapterProgressIdentity {
  return { chapterId: chapter.id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.manga?.title ?? "Unknown Manga", sourceOrder: chapter.sourceOrder, pageCount: chapter.pageCount };
}

function cachedIdentity(chapter: CachedChapter): ChapterProgressIdentity {
  return { chapterId: chapter.id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId: chapter.mangaId, mangaTitle: chapter.mangaTitle, sourceOrder: chapter.sourceOrder, pageCount: chapter.pageCount };
}

function client(backend: ProgressBackend) {
  return createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { signal: AbortSignal.timeout(15_000) }, backend.isDemo ? "demo" : "live");
}

async function mirrorProgress(head: ProgressHead) {
  const { backend, chapter, patch } = head;
  const cached = await getCachedChapter(backend.serverBaseUrl, chapter.chapterId);
  if (cached) await saveCachedChapter({ ...cached, lastPageRead: patch.lastPageRead, isRead: patch.isRead });
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

export async function projectChapterProgress<T extends RemoteChapter>(backend: ProgressBackend, chapter: T) {
  const head = await getProgressHead(backend, chapter.id).catch(() => undefined);
  const pending = head && head.sequence > head.acknowledgedSequence && chapterIdentityMatches(head.chapter, progressChapterIdentity(chapter));
  return { ...chapter, ...(pending ? { isRead: head.patch.isRead, lastPageRead: head.patch.lastPageRead } : {}), progressEpoch: head?.epoch ?? 0,
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
  if (operation.kind === "reading" && !sameState(state, operation.baseline) && !sameState(state, head?.lastAcknowledged)
    && !sameState(state, head?.baseline) && !sameState(state, operation.patch)) {
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
      await deleteCachedChapter(backend.serverBaseUrl, operation.chapter.chapterId);
      progressChanged(backend);
    } catch (error) { console.warn("Progress synchronized; automatic download removal did not finish.", error); }
  }
}

async function drain(backend: ProgressBackend) {
  const owner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  if (!await acquireProgressLease(backend, owner)) return;
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
  if (running) return running;
  const job = (async () => {
    if (navigator.locks) await navigator.locks.request(`yomikura-progress:${backend.key}`, () => drain(backend));
    else await drain(backend);
  })();
  inFlight.set(backend.key, job);
  void job.finally(() => { if (inFlight.get(backend.key) === job) inFlight.delete(backend.key); }).catch(() => undefined);
  return job;
}

export async function writeChapterProgress(backend: ProgressBackend, chapterId: number, patch: Partial<ProgressPatch>, options: { requireAcknowledgment?: boolean; hideHistory?: boolean; fallback?: ChapterProgressIdentity } = {}) {
  let chapter: ChapterProgressIdentity;
  let baseline: ProgressIntent["baseline"];
  const cached = await getCachedChapter(backend.serverBaseUrl, chapterId);
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
    const cached = await getCachedChapter(backend.serverBaseUrl, chapterId);
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

export async function resolveProgressConflict(backend: ProgressBackend, chapterId: number, useSaved: boolean) {
  const remote = (await client(backend).GetChapter({ id: chapterId })).chapter;
  const head = await getProgressHead(backend, chapterId);
  if (!head || head.sequence <= head.acknowledgedSequence) return;
  if (useSaved && !chapterIdentityMatches(head.chapter, progressChapterIdentity(remote))) throw new Error("This saved change belongs to a different chapter. Keep the server's progress instead.");
  const baseline = { isRead: remote.isRead, lastPageRead: remote.lastPageRead };
  await saveProgressIntent(backend, { kind: "explicit", chapter: progressChapterIdentity(remote), baseline,
    patch: useSaved ? head.patch : baseline, hideHistory: useSaved && head.hideHistory,
  });
  await synchronizeProgress(backend);
}

export async function readProgressHistory(backend: ProgressBackend) {
  const events = await getReadingHistory(backend.serverBaseUrl);
  const pending = await getPendingHistory(backend);
  for (const head of pending) {
    const index = events.findIndex((event) => event.chapterId === head.chapter.chapterId && !!event.isDemo === backend.isDemo);
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
