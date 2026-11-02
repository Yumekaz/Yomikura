import { validateServerBaseUrl } from "../../config/server";
import { readLibraryIdentity, replaceLibraryIdentity, type LibraryIdentity, validLibraryMarker } from "./libraryIdentity";

const KEY = "yomikura-library-sessions-v1";
export const LIBRARY_SESSION_EVENT = "yomikura-library-session-changed";
type Sessions = Record<string, LibraryIdentity>;
function address(server: string) {
  const result = validateServerBaseUrl(server);
  if (!result.valid) throw new Error(result.message);
  return result.normalizedUrl.replace(/\/+$/, "");
}
function sessions(): Sessions {
  if (typeof localStorage === "undefined") return {};
  const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((item) => !validLibraryMarker((item as LibraryIdentity)?.marker))) throw new Error("Saved library identities could not be read. Pending updates are retained.");
  return value;
}
export function rememberedLibrary(server: string) { return sessions()[address(server)]; }
export function rememberLibrary(server: string, identity: LibraryIdentity) {
  if (!validLibraryMarker(identity.marker)) throw new Error("The library identity is invalid.");
  if (typeof localStorage === "undefined") return;
  const values = sessions(), key = address(server);
  if (values[key]?.marker === identity.marker) return;
  values[key] = identity;
  localStorage.setItem(KEY, JSON.stringify(values));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_SESSION_EVENT));
}
/** Never adopt a replacement marker as part of a mutation or replay. */
export async function assertLibrarySession(server: string, expected = rememberedLibrary(server)?.marker) {
  if (!expected) return;
  const remote = await readLibraryIdentity(server);
  if (remote?.marker !== expected) throw new Error("This address now points to a different library. Pending updates are kept on this device. Reconnect and review them before syncing.");
}
export async function separateLibrarySession(server: string) {
  const expected = rememberedLibrary(server);
  if (!expected) throw new Error("Reconnect before separating this library's saved data.");
  const identity = await replaceLibraryIdentity(server, expected);
  rememberLibrary(server, identity);
}
