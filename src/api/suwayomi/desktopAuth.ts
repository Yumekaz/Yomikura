import { useSyncExternalStore } from "react";
import { validateServerBaseUrl } from "../../config/server";

type Target = { profileId: string; serverBaseUrl: string };
type Session = Target & { sessionId: string };
type Reply = { status: number; contentType: string; bytes: number[] };
let session: Session | undefined;
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => { generation++; listeners.forEach((listener) => listener()); };
export const useDesktopAuthRevision = () => useSyncExternalStore(subscribe, () => generation, () => 0);

const normalize = (value: string) => {
  const result = validateServerBaseUrl(value);
  return result.valid ? result.normalizedUrl.replace(/\/+$/, "") : "";
};

async function revoke(sessionId: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("clear_suwayomi_session", { sessionId });
}

export function clearDesktopAuth() {
  const prior = session;
  session = undefined;
  notify();
  if (prior) void revoke(prior.sessionId).catch(() => undefined);
}

let observing = false;
export async function signInToDesktop(profileId: string, address: string, username: string, password: string) {
  const { isTauri, useSettingsStore } = await import("../../stores/useSettingsStore");
  const target = { profileId, serverBaseUrl: normalize(address) };
  const selected = () => {
    const { activeProfileId, serverBaseUrl, mockMode } = useSettingsStore.getState();
    return !mockMode && target.profileId === activeProfileId && target.serverBaseUrl === normalize(serverBaseUrl);
  };
  if (!isTauri() || !target.serverBaseUrl.startsWith("https://") || !selected()) throw new Error("Choose the active Suwayomi profile with an HTTPS address.");
  if (!observing) {
    observing = true;
    useSettingsStore.subscribe((next, previous) => {
      if (next.activeProfileId !== previous.activeProfileId || next.serverBaseUrl !== previous.serverBaseUrl || next.mockMode !== previous.mockMode) clearDesktopAuth();
    });
  }
  clearDesktopAuth();
  const attempt = generation;
  useSettingsStore.setState({ connectionStatus: "testing", errorMessage: "" });
  let sessionId: string;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    ({ sessionId } = await invoke<{ sessionId: string }>("sign_in_suwayomi", { serverBaseUrl: target.serverBaseUrl, username, password }));
  } catch (error) {
    if (attempt !== generation || !selected()) return false;
    const message = typeof error === "string" ? error : "Suwayomi sign-in couldn’t be completed.";
    useSettingsStore.setState({ connectionStatus: "error", errorMessage: message });
    throw new Error(message);
  }
  if (attempt !== generation || !selected()) {
    await revoke(sessionId);
    return false;
  }
  const next = { ...target, sessionId };
  session = next;
  const connected = await useSettingsStore.getState().testConnection();
  if (session !== next) return false;
  if (!connected) {
    clearDesktopAuth();
    throw new Error(useSettingsStore.getState().errorMessage || "The protected library could not be opened.");
  }
  notify();
  return true;
}

export function hasDesktopAuth(serverBaseUrl: string) {
  return session?.serverBaseUrl === normalize(serverBaseUrl);
}

function forRequest(url: string) {
  if (!session) return;
  try {
    const address = new URL(url);
    if (address.href.startsWith(session.serverBaseUrl + "/api/") && !address.hash) return session;
  } catch { /* Relative and non-server assets use their ordinary loader. */ }
}

export function isProtectedLibraryImage(url: string, serverBaseUrl: string) {
  return !!forRequest(url) && hasDesktopAuth(serverBaseUrl);
}

export async function protectedResponse(url: string, serverBaseUrl: string, signal?: AbortSignal) {
  return isProtectedLibraryImage(url, serverBaseUrl) ? libraryFetch(url, { signal }) : undefined;
}

export async function protectedImage(url: string, serverBaseUrl: string, signal?: AbortSignal) {
  const response = await protectedResponse(url, serverBaseUrl, signal);
  if (!response) return;
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Suwayomi did not return the requested image.");
  return response.blob();
}

/** Run protected requests via the native client and preserve normal fetch elsewhere. */
export async function libraryFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const current = forRequest(url);
  if (!current) return fetch(input, init);
  const method = init?.method ?? "GET";
  const body = init?.body;
  if (input instanceof Request || (method !== "GET" && (method !== "POST" || typeof body !== "string"))) {
    throw new Error("Use your signed-in Suwayomi web interface to upload files.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  init?.signal?.throwIfAborted();
  if (current !== forRequest(url)) throw new DOMException("The selected library changed", "AbortError");
  const result = await invoke<Reply>("request_suwayomi", {
    sessionId: current.sessionId, serverBaseUrl: current.serverBaseUrl, url,
    body: typeof body === "string" ? body : null,
  });
  init?.signal?.throwIfAborted();
  if (current !== forRequest(url)) throw new DOMException("The selected library changed", "AbortError");
  return new Response(result.bytes.length ? new Uint8Array(result.bytes) : null, {
    status: result.status,
    headers: { "content-type": result.contentType },
  });
}
