import type { ProgressBackend } from "./backendIdentity";
import { acquireTrackingLease, getPendingTracking, getProgressOperations, recordTrackingResult, type ProgressHead } from "./progressStorage";
import { assertTrackingBackend, pushLinkedTrackerProgress, trackingErrorMessage } from "./trackingActions";
import { TrackingBusyError, withTrackingLock } from "./trackingCoordination";

const inFlight = new Map<string, { promise: Promise<void>; rerun: boolean; force: boolean }>();
const current = (backend: ProgressBackend) => { try { assertTrackingBackend(backend); return true; } catch { return false; } };
async function drain(backend: ProgressBackend, force: boolean) {
  try {
    await withTrackingLock(backend, async (owner) => {
    const groups = new Map<string, ProgressHead[]>();
    for (const head of await getPendingTracking(backend)) {
      const key = JSON.stringify([head.chapter.mangaId, head.chapter.mangaTitle]);
      groups.set(key, [...(groups.get(key) ?? []), head]);
    }
    for (const requests of groups.values()) {
      if (!force && requests.every((head) => (head.trackingRetryAt ?? 0) > Date.now())) continue;
      if (!current(backend)) return;
      if (!await acquireTrackingLease(backend, owner)) return;
      const mangaId = requests[0].chapter.mangaId;
      const shouldProceed = async () => {
        if (!current(backend)) return false;
        const pending = await getPendingTracking(backend);
        if (!pending.some((head) => requests.some((request) => head.entityKey === request.entityKey && head.trackingDueSequence === request.trackingDueSequence))) return false;
        return !(await getProgressOperations(backend)).some((operation) => operation.chapter.mangaId === mangaId);
      };
      if (!await shouldProceed()) continue;
      try {
        if (!backend.isDemo) {
          const result = await pushLinkedTrackerProgress(backend, mangaId, { mangaTitle: requests[0].chapter.mangaTitle, shouldProceed });
          if (result.deferred) continue;
        }
        if (!current(backend)) return;
        await recordTrackingResult(backend, requests, owner);
      } catch (error) {
        if (!current(backend)) return;
        await recordTrackingResult(backend, requests, owner, trackingErrorMessage(error));
      }
    }
    });
  } catch (error) { if (!(error instanceof TrackingBusyError)) throw error; }
}

/** Independent retries never hold back acknowledged reading progress or retarget a profile. */
export function synchronizeTracking(backend: ProgressBackend, options: { force?: boolean } = {}): Promise<void> {
  const running = inFlight.get(backend.key);
  if (running) { running.rerun = true; running.force ||= !!options.force; return running.promise; }
  const task = { promise: Promise.resolve(), rerun: false, force: !!options.force };
  const job = (async () => {
    do {
      task.rerun = false; const force = task.force; task.force = false;
      await drain(backend, force);
    } while (task.rerun && current(backend));
  })();
  task.promise = job; inFlight.set(backend.key, task);
  void job.finally(() => { if (inFlight.get(backend.key) === task) inFlight.delete(backend.key); }).catch(() => undefined);
  return job;
}
