import type { ProgressBackend } from "./backendIdentity";
import { acquireTrackingLease, releaseTrackingLease } from "./progressStorage";

export class TrackingBusyError extends Error {
  constructor() { super("Tracking is already updating in another window. Wait for it to finish and retry."); this.name = "TrackingBusyError"; }
}
/** Serialize manual binding/edits with automatic retries, including other tabs. */
export async function withTrackingLock<T>(backend: ProgressBackend, work: (owner: string) => Promise<T>): Promise<T> {
  const run = async (exclusive: boolean) => {
    const owner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    if (!await acquireTrackingLease(backend, owner, exclusive)) throw new TrackingBusyError();
    const renewal = window.setInterval(() => { void acquireTrackingLease(backend, owner).catch(() => undefined); }, 10_000);
    try { return await work(owner); }
    finally { window.clearInterval(renewal); await releaseTrackingLease(backend, owner); }
  };
  return navigator.locks ? navigator.locks.request(`yomikura-tracking:${backend.key}`, () => run(true)) : run(false);
}
