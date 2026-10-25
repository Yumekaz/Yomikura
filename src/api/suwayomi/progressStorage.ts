import { chapterIdentityMatches, type ChapterProgressIdentity, type ProgressBackend } from "./backendIdentity";

export const PROGRESS_CHANGED_EVENT = "yomikura-progress-changed";
const DATABASE = "yomikura-progress";
export type ProgressPatch = { isRead: boolean; lastPageRead: number; isBookmarked?: boolean };
export type ProgressIntent = {
  kind: "reading" | "explicit";
  chapter: ChapterProgressIdentity;
  patch: Partial<ProgressPatch>;
  baseline: { isRead: boolean; lastPageRead: number };
  epoch?: number;
  hideHistory?: boolean;
  deleteAfterAck?: boolean;
  expectedSequence?: number;
  trackCompletion?: boolean;
};
export interface ProgressHead {
  entityKey: string;
  backend: ProgressBackend;
  chapter: ChapterProgressIdentity;
  epoch: number;
  sequence: number;
  acknowledgedSequence: number;
  patch: ProgressPatch;
  baseline: { isRead: boolean; lastPageRead: number };
  lastAcknowledged?: { isRead: boolean; lastPageRead: number };
  hasActivity: boolean;
  hideHistory: boolean;
  updatedAt: number;
  activityAt?: number;
  dirtyFields: (keyof ProgressPatch)[];
  lastKind: ProgressIntent["kind"];
  serverRevision?: number;
  trackingDueSequence?: number;
  trackingAcknowledgedSequence?: number;
  trackingAttempts?: number;
  trackingRetryAt?: number;
  trackingError?: string;
  trackingCancelledThrough?: number;
}
export interface ProgressOperation extends ProgressIntent {
  sequence: number;
  entityKey: string;
  backend: ProgressBackend;
  patch: ProgressPatch;
  epoch: number;
  createdAt: number;
  status: "pending" | "sending" | "blocked";
  error?: string;
  fields: (keyof ProgressPatch)[];
}
type Lease = { key: string; owner: string; expires: number };
const entityKey = (backend: ProgressBackend, chapterId: number) => JSON.stringify([backend.key, chapterId]);

export function progressChanged(backend: ProgressBackend, kind: "queued" | "changed" | "error" | "tracking" = "changed") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT, { detail: { backendKey: backend.key, kind } }));
}

async function openProgressDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const heads = db.createObjectStore("heads", { keyPath: "entityKey" });
      heads.createIndex("backend", "backend.key");
      const operations = db.createObjectStore("operations", { keyPath: "sequence", autoIncrement: true });
      operations.createIndex("backend", "backend.key");
      operations.createIndex("entity", "entityKey");
      db.createObjectStore("leases", { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Yomikura tabs to open progress storage."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function read<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openProgressDB();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Progress storage transaction failed."));
  });
  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (error) {
    try { tx.abort(); } catch { /* Already completed or aborted. */ }
    await done.catch(() => undefined);
    throw error;
  } finally { db.close(); }
}

export async function getProgressHead(backend: ProgressBackend, chapterId: number) {
  return transaction(["heads"], "readonly", (tx) => read<ProgressHead | undefined>(tx.objectStore("heads").get(entityKey(backend, chapterId))));
}

export async function getProgressHeads(backend: ProgressBackend) {
  return transaction(["heads"], "readonly", (tx) => read<ProgressHead[]>(tx.objectStore("heads").index("backend").getAll(backend.key)));
}

export function progressHeadVersion(head: ProgressHead | undefined) {
  return head ? `${head.sequence}:${head.acknowledgedSequence}:${head.epoch}:${head.serverRevision ?? 0}` : "none";
}

/** Only a fresh response with no pending local edits may replace an observed server baseline. */
export async function observeChapterProgress(backend: ProgressBackend, chapter: ChapterProgressIdentity, state: ProgressIntent["baseline"], expectedVersion?: string) {
  return transaction(["heads"], "readwrite", async (tx) => {
    const store = tx.objectStore("heads");
    const head = await read<ProgressHead | undefined>(store.get(entityKey(backend, chapter.chapterId)));
    if (expectedVersion !== undefined && progressHeadVersion(head) !== expectedVersion) return { head, stale: true };
    if (!head || head.sequence > head.acknowledgedSequence) return { head, stale: false };
    const identityChanged = !chapterIdentityMatches(head.chapter, chapter);
    const changed = identityChanged || head.patch.isRead !== state.isRead || head.patch.lastPageRead !== state.lastPageRead;
    if (!changed) return { head, stale: false };
    const next: ProgressHead = { ...head, chapter, patch: { ...head.patch, ...state }, baseline: state, lastAcknowledged: state,
      epoch: head.epoch + (identityChanged || head.patch.isRead && !state.isRead ? 1 : 0),
      serverRevision: (head.serverRevision ?? 0) + 1,
      ...(identityChanged ? { hasActivity: false, activityAt: undefined, hideHistory: true, dirtyFields: [] } : {}),
      ...(identityChanged || !state.isRead ? { trackingAcknowledgedSequence: head.trackingDueSequence ?? 0, trackingError: undefined } : {}),
    };
    store.put(next);
    return { head: next, stale: false };
  });
}

export async function setProgressHistoryHidden(backend: ProgressBackend, chapterId: number) {
  await transaction(["heads"], "readwrite", async (tx) => {
    const store = tx.objectStore("heads");
    const head = await read<ProgressHead | undefined>(store.get(entityKey(backend, chapterId)));
    if (head) store.put({ ...head, hideHistory: true });
  });
  progressChanged(backend);
}

export async function getProgressOperations(backend: ProgressBackend) {
  return transaction(["operations"], "readonly", async (tx) => {
    const operations = await read<ProgressOperation[]>(tx.objectStore("operations").index("backend").getAll(backend.key));
    return operations.sort((a, b) => a.sequence - b.sequence);
  });
}

export async function enqueueProgress(backend: ProgressBackend, intent: ProgressIntent) {
  const result = await transaction(["heads", "operations"], "readwrite", async (tx) => {
    const heads = tx.objectStore("heads");
    const operations = tx.objectStore("operations");
    const key = entityKey(backend, intent.chapter.chapterId);
    const previous = await read<ProgressHead | undefined>(heads.get(key));
    if (intent.expectedSequence !== undefined && (previous?.sequence ?? 0) !== intent.expectedSequence) return { head: previous!, accepted: false, reason: "changed" };
    const sameChapter = previous && chapterIdentityMatches(previous.chapter, intent.chapter);
    const previousPending = !!previous && previous.sequence > previous.acknowledgedSequence;
    const identityTransition = !!previous && !sameChapter && !previousPending;
    // A late callback from a reader opened before reset/unread is obsolete.
    if (intent.kind === "reading" && previous && !sameChapter && previousPending) return { head: previous, accepted: false, reason: "identity" };
    if (intent.kind === "reading" && (intent.epoch ?? 0) !== (previous?.epoch ?? 0) + (identityTransition ? 1 : 0)) return { head: previous!, accepted: false, reason: "epoch" };
    const pending = sameChapter && previous.sequence > previous.acknowledgedSequence;
    const baseline = intent.baseline;
    const isRead = intent.kind === "explicit" ? intent.patch.isRead ?? (pending ? previous.patch.isRead : baseline.isRead)
      : !!intent.patch.isRead || (sameChapter ? previous.patch.isRead : baseline.isRead);
    const patch: ProgressPatch = {
      isRead,
      lastPageRead: Math.max(0, intent.patch.lastPageRead ?? (pending ? previous.patch.lastPageRead : baseline.lastPageRead)),
      ...(intent.patch.isBookmarked !== undefined ? { isBookmarked: intent.patch.isBookmarked } : pending && previous.patch.isBookmarked !== undefined ? { isBookmarked: previous.patch.isBookmarked } : {}),
    };
    const epoch = (previous?.epoch ?? 0) + (intent.kind === "explicit" || identityTransition ? 1 : 0);
    if (intent.kind === "reading" && sameChapter && pending && previous.lastKind === "reading" && !previous.hideHistory && JSON.stringify(previous.patch) === JSON.stringify(patch)) return { head: previous, accepted: true };
    const older = await read<ProgressOperation[]>(operations.index("entity").getAll(key));
    for (const operation of older) {
      if (operation.status !== "sending" && !(intent.kind === "reading" && operation.kind === "explicit")) operations.delete(operation.sequence);
    }
    const createdAt = Date.now();
    const deleteAfterAck = intent.kind === "reading" && patch.isRead && (intent.deleteAfterAck && !(sameChapter ? previous.patch.isRead : baseline.isRead)
      || older.some((item) => item.epoch === epoch && item.deleteAfterAck));
    const fields = [...new Set([...(Object.keys(intent.patch) as (keyof ProgressPatch)[]), ...(pending ? previous.dirtyFields ?? ["isRead", "lastPageRead"] as (keyof ProgressPatch)[] : [])])];
    const operation = { ...intent, backend, entityKey: key, patch, epoch, createdAt, status: "pending", deleteAfterAck, fields };
    const sequence = Number(await read(operations.add(operation)));
    const head: ProgressHead = {
      entityKey: key, backend, chapter: intent.chapter, epoch, sequence,
      acknowledgedSequence: previous?.acknowledgedSequence ?? 0, patch,
      baseline: sameChapter && pending ? previous.baseline : baseline,
      ...(sameChapter ? { lastAcknowledged: previous.lastAcknowledged } : {}),
      hasActivity: intent.kind === "reading" || (sameChapter ? previous.hasActivity : false),
      hideHistory: intent.kind === "reading" ? false : intent.hideHistory ?? (sameChapter ? previous.hideHistory : false),
      updatedAt: createdAt,
      activityAt: intent.kind === "reading" ? createdAt : previous?.activityAt,
      dirtyFields: fields,
      lastKind: intent.kind,
      serverRevision: previous?.serverRevision ?? 0,
      trackingDueSequence: sameChapter ? previous.trackingDueSequence : undefined,
      trackingAcknowledgedSequence: sameChapter ? intent.kind === "explicit" && intent.patch.isRead === false ? previous.trackingDueSequence : previous.trackingAcknowledgedSequence : undefined,
      trackingAttempts: sameChapter ? previous.trackingAttempts : undefined,
      trackingRetryAt: sameChapter ? previous.trackingRetryAt : undefined,
      trackingError: sameChapter && !(intent.kind === "explicit" && intent.patch.isRead === false) ? previous.trackingError : undefined,
      trackingCancelledThrough: sameChapter ? previous.trackingCancelledThrough : undefined,
    };
    heads.put(head);
    return { head, accepted: true };
  });
  progressChanged(backend, result.accepted ? "queued" : "changed");
  return result;
}

export async function acquireProgressLease(backend: ProgressBackend, owner: string, exclusiveBrowserLock = false) {
  return transaction(["leases"], "readwrite", async (tx) => {
    const store = tx.objectStore("leases");
    const lease = await read<Lease | undefined>(store.get(backend.key));
    // A granted Web Lock proves the previous tab/process no longer owns the worker.
    // Recover its durable lease immediately instead of waiting for a crash timeout.
    if (!exclusiveBrowserLock && lease && lease.owner !== owner && lease.expires > Date.now()) return false;
    store.put({ key: backend.key, owner, expires: Date.now() + 60_000 });
    return true;
  });
}

export async function releaseProgressLease(backend: ProgressBackend, owner: string) {
  await transaction(["leases"], "readwrite", async (tx) => {
    const store = tx.objectStore("leases");
    if ((await read<Lease | undefined>(store.get(backend.key)))?.owner === owner) store.delete(backend.key);
  });
}

export async function markProgressOperation(operation: ProgressOperation, owner: string, status: ProgressOperation["status"], error?: string) {
  return transaction(["operations", "leases"], "readwrite", async (tx) => {
    const lease = await read<Lease | undefined>(tx.objectStore("leases").get(operation.backend.key));
    if (lease?.owner !== owner || lease.expires <= Date.now()) return false;
    const existing = await read<ProgressOperation | undefined>(tx.objectStore("operations").get(operation.sequence));
    if (!existing) return false;
    tx.objectStore("operations").put({ ...existing, status, error });
    return true;
  });
}

export async function acknowledgeProgress(operation: ProgressOperation, owner: string, acknowledged: ProgressPatch) {
  return transaction(["heads", "operations", "leases"], "readwrite", async (tx) => {
    const lease = await read<Lease | undefined>(tx.objectStore("leases").get(operation.backend.key));
    if (lease?.owner !== owner || lease.expires <= Date.now()) return false;
    const head = await read<ProgressHead>(tx.objectStore("heads").get(operation.entityKey));
    if (operation.sequence > head.acknowledgedSequence) {
      const isLatest = head.sequence === operation.sequence;
      const completed = (operation.kind === "reading" || operation.trackCompletion) && acknowledged.isRead && head.patch.isRead && operation.epoch === head.epoch
        && operation.sequence > (head.trackingCancelledThrough ?? 0) && !(head.lastAcknowledged?.isRead ?? head.baseline.isRead) && Number.isFinite(operation.chapter.chapterNumber) && operation.chapter.chapterNumber > 0;
      tx.objectStore("heads").put({ ...head, acknowledgedSequence: operation.sequence, lastAcknowledged: acknowledged,
        serverRevision: (head.serverRevision ?? 0) + 1,
        ...(isLatest ? { patch: acknowledged } : {}),
        ...(completed ? { trackingDueSequence: operation.sequence, trackingAttempts: 0, trackingRetryAt: 0, trackingError: undefined } : {}),
      });
    }
    const older = await read<ProgressOperation[]>(tx.objectStore("operations").index("entity").getAll(operation.entityKey));
    for (const item of older) if (item.sequence <= operation.sequence) tx.objectStore("operations").delete(item.sequence);
    return true;
  });
}

export async function retryBlockedProgress(backend: ProgressBackend) {
  await transaction(["operations"], "readwrite", async (tx) => {
    const store = tx.objectStore("operations");
    const operations = await read<ProgressOperation[]>(store.index("backend").getAll(backend.key));
    for (const item of operations) if (item.status === "blocked") store.put({ ...item, status: "pending", error: undefined });
  });
  progressChanged(backend, "queued");
}

const trackingLeaseKey = (backend: ProgressBackend) => JSON.stringify(["tracking", backend.key]);
export async function acquireTrackingLease(backend: ProgressBackend, owner: string, exclusiveBrowserLock = false) {
  return transaction(["leases"], "readwrite", async (tx) => {
    const store = tx.objectStore("leases"); const key = trackingLeaseKey(backend);
    const lease = await read<Lease | undefined>(store.get(key));
    if (!exclusiveBrowserLock && lease && lease.owner !== owner && lease.expires > Date.now()) return false;
    store.put({ key, owner, expires: Date.now() + 60_000 }); return true;
  });
}
export async function releaseTrackingLease(backend: ProgressBackend, owner: string) {
  await transaction(["leases"], "readwrite", async (tx) => {
    const store = tx.objectStore("leases"); const key = trackingLeaseKey(backend);
    if ((await read<Lease | undefined>(store.get(key)))?.owner === owner) store.delete(key);
  });
}
export async function getPendingTracking(backend: ProgressBackend) {
  return (await getProgressHeads(backend)).filter((head) => (head.trackingDueSequence ?? 0) > (head.trackingAcknowledgedSequence ?? 0));
}
export async function recordTrackingResult(backend: ProgressBackend, requests: ProgressHead[], owner: string, error?: string) {
  await transaction(["heads", "leases"], "readwrite", async (tx) => {
    const lease = await read<Lease | undefined>(tx.objectStore("leases").get(trackingLeaseKey(backend)));
    if (lease?.owner !== owner || lease.expires <= Date.now()) return;
    const store = tx.objectStore("heads");
    for (const request of requests) {
      const head = await read<ProgressHead | undefined>(store.get(request.entityKey));
      if (!head || !chapterIdentityMatches(head.chapter, request.chapter)) continue;
      if (!error) store.put({ ...head, trackingAcknowledgedSequence: Math.max(head.trackingAcknowledgedSequence ?? 0, request.trackingDueSequence ?? 0),
        ...(head.trackingDueSequence === request.trackingDueSequence ? { trackingAttempts: 0, trackingRetryAt: 0, trackingError: undefined } : {}),
      });
      else if (head.trackingDueSequence === request.trackingDueSequence && (head.trackingDueSequence ?? 0) > (head.trackingAcknowledgedSequence ?? 0)) {
        const attempts = (head.trackingAttempts ?? 0) + 1;
        store.put({ ...head, trackingAttempts: attempts, trackingError: error, trackingRetryAt: Date.now() + Math.min(900_000, 15_000 * 2 ** Math.min(attempts - 1, 6)) });
      }
    }
  });
  progressChanged(backend, "tracking");
}
export async function dismissTracking(backend: ProgressBackend, requests: ProgressHead[]) {
  await transaction(["heads"], "readwrite", async (tx) => {
    const store = tx.objectStore("heads"); const current: ProgressHead[] = [];
    for (const request of requests) {
      const head = await read<ProgressHead | undefined>(store.get(request.entityKey));
      if (!head || head.backend.key !== backend.key || !chapterIdentityMatches(head.chapter, request.chapter) || head.trackingDueSequence !== request.trackingDueSequence) throw new Error("Tracker progress changed while you were reviewing it. Review the current retry before dismissing it.");
      current.push(head);
    }
    for (const head of current) store.put({ ...head, trackingAcknowledgedSequence: head.trackingDueSequence, trackingError: undefined, trackingRetryAt: 0 });
  });
  progressChanged(backend, "tracking");
}

/** A manual tracker position edit takes precedence over reading intents already present at that time. */
export async function suppressEarlierTracking(backend: ProgressBackend, requests: ProgressHead[]) {
  await transaction(["heads"], "readwrite", async (tx) => {
    const store = tx.objectStore("heads");
    for (const request of requests) {
      const head = await read<ProgressHead | undefined>(store.get(request.entityKey));
      if (!head || head.backend.key !== backend.key || !chapterIdentityMatches(head.chapter, request.chapter)) continue;
      const through = Math.max(head.trackingCancelledThrough ?? 0, request.sequence);
      store.put({ ...head, trackingCancelledThrough: through,
        ...((head.trackingDueSequence ?? 0) <= through ? { trackingAcknowledgedSequence: head.trackingDueSequence, trackingError: undefined, trackingRetryAt: 0 } : {}),
      });
    }
  });
  progressChanged(backend, "tracking");
}
