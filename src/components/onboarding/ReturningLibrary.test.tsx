// @vitest-environment happy-dom
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppShell from "../layout/AppShell";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { rememberLibrary } from "../../api/suwayomi/librarySession";
import { render, waitForRender } from "../../test/render";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), connection: vi.fn(), jar: undefined as Promise<string> | undefined,
  downloads: { pauseForShutdown: vi.fn(), restoreDownloadJobs: vi.fn(async () => {}) },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTheme: async () => {} }) }));
vi.mock("../../stores/settingsStorage", () => ({ createSettingsStorage: () => localStorage }));
vi.mock("../../stores/useDownloadStore", () => ({ useDownloadStore: Object.assign(() => mocks.downloads, { getState: () => mocks.downloads }) }));
vi.mock("../../api/suwayomi/offlineCache", () => ({ getCachedChapters: async () => [], normalizeCacheServerUrl: (value: string) => value.replace(/\/+$/, "") }));
vi.mock("../../api/suwayomi/libraryMetadata", () => ({ hasLibraryMetadata: async () => true }));
vi.mock("../../hooks/useDeviceProfile", () => ({ useDeviceProfileBootstrap: () => {} }));
vi.mock("../../hooks/useScheduledBackup", () => ({ useScheduledBackup: () => {} }));
vi.mock("../../hooks/useScheduledLibraryUpdate", () => ({ useScheduledLibraryUpdate: () => {} }));
vi.mock("../../hooks/useProgressSynchronization", () => ({ useProgressSynchronization: () => {} }));
vi.mock("../../hooks/useDownloadCleanup", () => ({ useDownloadCleanup: () => {} }));
vi.mock("../UpdateNotificationBanner", () => ({ UpdateNotificationBanner: () => null }));
vi.mock("../layout/PwaUpdateNotice", () => ({ PwaUpdateNotice: () => null }));
vi.mock("../ProgressSyncStatus", () => ({ ProgressSyncStatus: () => null }));
vi.mock("../library/LibraryUpdateNotice", () => ({ LibraryUpdateNotice: () => null }));
vi.mock("../ReadingModeNotice", () => ({ ReadingModeNotice: () => null }));
vi.mock("../settings/RestoreRecoveryPanel", () => ({ RestoreRecoveryPanel: () => null }));
vi.mock("../../features/extensions/ExtensionUpdateNotice", () => ({ ExtensionUpdateNotice: () => null, ExtensionUpdatesBadge: () => null }));

let view: Awaited<ReturnType<typeof render>> | undefined;
let client: QueryClient;
const calls = (command: string) => mocks.invoke.mock.calls.filter(([name]) => name === command);

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.jar = undefined;
  Object.defineProperty(window, "isTauri", { value: true, configurable: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  mocks.connection.mockResolvedValue(false);
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hasHydrated: true, mockMode: false, profiles: [{ id: "managed", name: "On this device", url: "http://127.0.0.1:4567" }], activeProfileId: "managed", managedLibraryProfileId: "managed", serverDataPath: "C:/ReturningFixture/library", serverBaseUrl: "http://127.0.0.1:4567", connectionStatus: "disconnected", testConnection: mocks.connection });
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === "check_java_installed") return true;
    if (command === "download_suwayomi_jar") return mocks.jar ?? "verified.jar";
    if (command === "start_backend") return 4567;
    if (command === "stop_backend") return;
    throw new Error(`Unexpected native command: ${command}`);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await view?.unmount(); view = undefined; client.clear(); Object.defineProperty(window, "isTauri", { value: false, configurable: true }); useSettingsStore.setState(useSettingsStore.getInitialState()); });

async function openReturningLibrary() {
  view = await render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/library"]}><Routes><Route element={<AppShell />}><Route path="/library" element={<h1>Retained bookshelf</h1>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
  await waitForRender(() => expect(calls("download_suwayomi_jar")).toHaveLength(1));
}

it("keeps the returning library available while native startup is pending, without an offline choice", async () => {
  let release!: (value: string) => void;
  mocks.jar = new Promise((resolve) => { release = resolve; });
  await openReturningLibrary();
  expect(view!.container.querySelector("h1")?.textContent).toBe("Retained bookshelf");
  expect(view!.container.textContent).toContain("Opening your library in the background");
  expect(view!.container.textContent).not.toContain("Continue offline");
  expect(view!.container.textContent).not.toContain("Making room for your stories");
  expect(calls("start_backend")).toHaveLength(0);
  await act(async () => release("verified.jar"));
  await waitForRender(() => expect(calls("start_backend")).toHaveLength(1));
  expect(view!.container.querySelector("h1")?.textContent).toBe("Retained bookshelf");
});

it("a library identity event refreshes route content without restarting or abandoning native startup", async () => {
  let release!: (value: string) => void;
  mocks.jar = new Promise((resolve) => { release = resolve; });
  await openReturningLibrary();
  await act(async () => { rememberLibrary("http://127.0.0.1:4567", { marker: "8ba96cab-7676-4c6c-bbe2-d542a49391e9" }); });
  await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent).toBe("Retained bookshelf"));
  expect(calls("check_java_installed")).toHaveLength(1);
  expect(calls("download_suwayomi_jar")).toHaveLength(1);
  expect(calls("stop_backend")).toHaveLength(0);
  await act(async () => release("verified.jar"));
  await waitForRender(() => expect(calls("start_backend")).toHaveLength(1));
  expect(calls("download_suwayomi_jar")).toHaveLength(1);
  expect(calls("stop_backend")).toHaveLength(0);
});
