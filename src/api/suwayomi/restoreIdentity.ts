import { establishLibraryIdentity, replaceLibraryIdentity, verifyLibraryIdentity } from "./libraryIdentity";
import { rememberLibrary } from "./librarySession";
const KEY = "yomikura-library-restores-v1";
type Restore = { token: string; id?: string; completedMarker?: string };
export const LIBRARY_RESTORE_EVENT = "yomikura-library-restore-changed";
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_RESTORE_EVENT)); };
function records(): Record<string, Restore> {
  const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Restore recovery information could not be read. Writes remain paused.");
  return value;
}
const address = (server: string) => new URL(server).toString().replace(/\/+$/, "");
export function pendingLibraryRestore(server: string) {
  if (typeof localStorage === "undefined") return undefined;
  const saved = records()[address(server)];
  return saved?.completedMarker ? undefined : saved;
}
export function beginLibraryRestore(server: string) {
  const values = records(), key = address(server);
  if (values[key] && !values[key].completedMarker) throw new Error("A previous restore still needs confirmation. Open Backups to check its status.");
  const checkpoint = { token: crypto.randomUUID() }; values[key] = checkpoint;
  localStorage.setItem(KEY, JSON.stringify(values)); changed(); return checkpoint.token;
}
export function recordLibraryRestore(server: string, token: string, id: string) {
  const values = records(), key = address(server);
  if (values[key]?.token !== token) throw new Error("Restore recovery information changed. Writes remain paused.");
  values[key].id = id; localStorage.setItem(KEY, JSON.stringify(values)); changed();
}
const finishing = new Map<string, Promise<void>>();
/** Renew even if a backup restored the old marker, so pre-restore actions stay quarantined. */
export function finishLibraryRestore(server: string, token: string) {
  const key = address(server), running = finishing.get(key); if (running) return running;
  const job = (async () => {
    const checkpoint = records()[key];
    if (checkpoint?.token !== token) throw new Error("Restore recovery information changed. Writes remain paused.");
    if (checkpoint.completedMarker) { await verifyLibraryIdentity(server, { marker: checkpoint.completedMarker }); return; }
    const current = await establishLibraryIdentity(server), fresh = await replaceLibraryIdentity(server, current);
    const values = records();
    if (values[key]?.token !== token) throw new Error("Restore recovery information changed. Writes remain paused.");
    rememberLibrary(server, fresh);
    values[key].completedMarker = fresh.marker; localStorage.setItem(KEY, JSON.stringify(values)); changed();
  })();
  finishing.set(key, job); void job.finally(() => { if (finishing.get(key) === job) finishing.delete(key); }).catch(() => undefined); return job;
}
