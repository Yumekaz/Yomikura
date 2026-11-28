// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearDesktopAuth, libraryFetch, protectedImage, signInToDesktop } from "./desktopAuth";

const fixture = vi.hoisted(() => {
  const state = { activeProfileId: "home", serverBaseUrl: "https://reader.example/library", mockMode: false, testConnection: vi.fn(async () => true) };
  const listeners = new Set<(next: typeof state, previous: typeof state) => void>();
  return { state, listeners, native: true, invoke: vi.fn() };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: fixture.invoke }));
vi.mock("../../stores/useSettingsStore", () => ({
  isTauri: () => fixture.native,
  useSettingsStore: {
    getState: () => fixture.state,
    subscribe: (listener: (next: typeof fixture.state, previous: typeof fixture.state) => void) => fixture.listeners.add(listener),
    setState: () => undefined,
  },
}));

const base = "https://reader.example/library", endpoint = base + "/api/graphql";
const signIn = () => signInToDesktop("home", base, "fixture-reader", "fixture-password");
const moveTo = (id: string, address = base) => {
  const previous = { ...fixture.state };
  Object.assign(fixture.state, { activeProfileId: id, serverBaseUrl: address });
  fixture.listeners.forEach((listener) => listener(fixture.state, previous));
};

beforeEach(() => {
  Object.assign(fixture.state, { activeProfileId: "home", serverBaseUrl: base });
  fixture.native = true;
  fixture.invoke.mockReset().mockImplementation(async (command) => command === "sign_in_suwayomi" ? { sessionId: "session" }
    : command === "request_suwayomi" ? { status: 200, contentType: "image/webp", bytes: [1, 2] } : undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response()));
});
afterEach(() => { clearDesktopAuth(); vi.unstubAllGlobals(); });

it("uses native transport only inside the selected HTTPS API and revokes on a profile switch", async () => {
  expect(await signIn()).toBe(true);
  const json = '{"query":"{ __typename }"}';
  await libraryFetch(endpoint, { method: "POST", body: json });
  expect(fixture.invoke).toHaveBeenCalledWith("request_suwayomi", { sessionId: "session", serverBaseUrl: base, url: endpoint, body: json });
  const image = await protectedImage(base + "/api/v1/manga/10/thumbnail", base);
  expect(image?.size).toBe(2);
  const other = "https://reader.example/library-other/api/graphql";
  await libraryFetch(other, { method: "POST", body: json });
  expect(fetch).toHaveBeenCalledWith(other, { method: "POST", body: json });
  moveTo("different-profile");
  await libraryFetch(endpoint);
  expect(fetch).toHaveBeenCalledWith(endpoint, undefined);
  await vi.waitFor(() => expect(fixture.invoke).toHaveBeenCalledWith("clear_suwayomi_session", { sessionId: "session" }));
});

it("discards a pending sign-in after the selected server changes", async () => {
  let finish!: (response: { sessionId: string }) => void;
  fixture.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const signingIn = signIn();
  await vi.waitFor(() => expect(finish).toBeDefined());
  moveTo("remote", "https://another.example");
  finish({ sessionId: "obsolete" });
  expect(await signingIn).toBe(false);
  expect(fixture.invoke).toHaveBeenCalledWith("clear_suwayomi_session", { sessionId: "obsolete" });
});

it("keeps browser requests on ordinary fetch and prevents credentials over HTTP", async () => {
  fixture.native = false;
  await expect(signIn()).rejects.toThrow("HTTPS");
  await libraryFetch(endpoint);
  expect(fetch).toHaveBeenCalledWith(endpoint, undefined);
  expect(fixture.invoke).not.toHaveBeenCalled();
});
