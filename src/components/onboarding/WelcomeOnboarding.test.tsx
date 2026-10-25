// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WelcomeOnboarding } from "../layout/AppShell";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { render, waitForRender } from "../../test/render";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), complete: vi.fn(), hasJava: true, failStart: false, jar: undefined as Promise<unknown> | undefined }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/path", () => ({ appLocalDataDir: async () => "C:/OwnedPreview/app.yomikura.firstlaunch/" }));
vi.mock("../../stores/settingsStorage", () => ({ createSettingsStorage: () => localStorage }));
let view: Awaited<ReturnType<typeof render>> | undefined;
function Harness({ offline = false }: { offline?: boolean }) {
  const [done, setDone] = useState(false);
  const settings = useSettingsStore();
  return done ? <div>Library route opened</div> : <WelcomeOnboarding serverBaseUrl={settings.serverBaseUrl} setServerBaseUrl={settings.setServerBaseUrl}
    testConnection={async () => { useSettingsStore.setState({ connectionStatus: "connected" }); return true; }} errorMessage="" setMockMode={settings.setMockMode}
    onBeginSetup={() => {}} onConnected={() => { mocks.complete(); setDone(true); }} onReadOffline={offline ? () => setDone(true) : undefined} />;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.hasJava = true; mocks.failStart = false; mocks.jar = undefined;
  Object.defineProperty(window, "isTauri", { value: true, configurable: true });
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true });
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "check_java_installed") return mocks.hasJava;
    if (command === "download_and_install_jre") { mocks.hasJava = true; return; }
    if (command === "download_suwayomi_jar") return mocks.jar ?? "verified.jar";
    if (command === "start_backend") { if (mocks.failStart) throw new Error("Local engine could not start"); return 4568; }
    if (command === "stop_backend") return;
    throw new Error(`Unexpected native command: ${command}`);
  });
});
afterEach(async () => { await view?.unmount(); view = undefined; Object.defineProperty(window, "isTauri", { value: false, configurable: true }); });
const calls = (command: string) => mocks.invoke.mock.calls.filter(([name]) => name === command);
async function setup(offline = false) {
  view = await render(<Harness offline={offline} />);
  const start = [...view.container.querySelectorAll("button")].find((button) => button.textContent?.includes("Set up my library"));
  if (!start) throw new Error("Recommended setup action is missing");
  await act(async () => start.click());
}
it("installs missing reading essentials and hands the verified native engine to the app without stopping it", async () => {
  mocks.hasJava = false;
  await setup();
  await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce(), { timeout: 3000 });
  expect(calls("download_and_install_jre")).toHaveLength(1);
  expect(calls("start_backend")).toHaveLength(1);
  expect(calls("stop_backend")).toHaveLength(0);
  expect(useSettingsStore.getState().serverBaseUrl).toBe("http://127.0.0.1:4568");
  expect(useSettingsStore.getState().serverDataPath).toBe("C:/OwnedPreview/app.yomikura.firstlaunch/server-data");
  expect(useSettingsStore.getState().managedLibraryProfileId).toBe(useSettingsStore.getState().activeProfileId);
});
it("never starts an abandoned engine when a download finishes after leaving setup", async () => {
  let release!: () => void; mocks.jar = new Promise<void>((resolve) => { release = resolve; });
  await setup(true);
  await waitForRender(() => expect(calls("download_suwayomi_jar")).toHaveLength(1));
  const offline = [...view!.container.querySelectorAll("button")].find((button) => button.textContent === "Continue offline")!;
  await act(async () => offline.click());
  await act(async () => release());
  expect(calls("start_backend")).toHaveLength(0);
});
it("a failed startup can retry without an old cleanup killing its replacement", async () => {
  mocks.failStart = true;
  await setup();
  await waitForRender(() => expect(view!.container.textContent).toContain("Your library couldn’t start."));
  mocks.failStart = false;
  const retry = [...view!.container.querySelectorAll("button")].find((button) => button.textContent?.includes("Try again"))!;
  await act(async () => retry.click());
  await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce(), { timeout: 3000 });
  expect(calls("start_backend")).toHaveLength(2);
  expect(calls("stop_backend")).toHaveLength(1);
});
it("creates a local profile without overwriting an existing remote library", async () => {
  useSettingsStore.setState({ profiles: [{ id: "remote", name: "Home", url: "https://home.example" }], activeProfileId: "remote", serverBaseUrl: "https://home.example" });
  await setup();
  await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce(), { timeout: 3000 });
  expect(useSettingsStore.getState().profiles.find((profile) => profile.id === "remote")?.url).toBe("https://home.example");
  expect(useSettingsStore.getState().activeProfileId).not.toBe("remote");
});
