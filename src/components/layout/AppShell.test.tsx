// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getCachedChapters, type CachedChapter } from "../../api/suwayomi/offlineCache";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { render, waitForRender } from "../../test/render";
import AppShell from "./AppShell";

vi.mock("../../api/suwayomi/offlineCache", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/suwayomi/offlineCache")>(),
  getCachedChapters: vi.fn(),
}));
vi.mock("../../stores/useDownloadStore", () => ({
  useDownloadStore: { getState: () => ({ pauseForShutdown: vi.fn(), restoreDownloadJobs: vi.fn() }) },
}));
vi.mock("../UpdateNotificationBanner", () => ({ UpdateNotificationBanner: () => null }));

const server = "http://offline.example:4567";
const chapter: CachedChapter = {
  cacheKey: `${server}::12`, serverBaseUrl: server, id: 12, name: "Chapter 1",
  chapterNumber: 1, mangaId: 42, mangaTitle: "Saved title", sourceOrder: 0,
  pageCount: 1, pages: ["/page.jpg"], cachedUrls: [`${server}/page.jpg`],
  totalSizeBytes: 100, cachedAt: 1,
};
let view: Awaited<ReturnType<typeof render>> | undefined;
let client: QueryClient;

async function open(path: string) {
  view = await render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<div data-testid="route">Route content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({
    ...useSettingsStore.getInitialState(), hasHydrated: true,
    serverBaseUrl: server, connectionStatus: "error", mockMode: false,
    testConnection: vi.fn().mockResolvedValue(false),
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(getCachedChapters).mockResolvedValue([chapter]);
});

afterEach(async () => {
  await view?.unmount();
  view = undefined;
  client.clear();
});

describe("offline shell access", () => {
  it.each(["/library", "/library/", "/downloads", "/history", "/manga/42", "/reader/12"])(
    "opens %s with cached chapters while the server is unreachable", async (path) => {
      await open(path);
      await waitForRender(() => expect(view!.container.querySelector('[data-testid="route"]')).not.toBeNull());
      expect(getCachedChapters).toHaveBeenCalledWith(server);
    },
  );

  it("waits for cache discovery before showing onboarding on a cold start", async () => {
    let resolveCache!: (chapters: CachedChapter[]) => void;
    vi.mocked(getCachedChapters).mockReturnValue(new Promise((resolve) => { resolveCache = resolve; }));
    useSettingsStore.setState({ connectionStatus: "disconnected" });
    await open("/reader/12");
    expect(view!.container.querySelector("h1")).toBeNull();
    expect(view!.container.querySelector('[data-testid="route"]')).toBeNull();
    await act(async () => resolveCache([chapter]));
    await waitForRender(() => expect(view!.container.querySelector('[data-testid="route"]')).not.toBeNull());
  });

  it("preserves onboarding when there are no cached chapters", async () => {
    vi.mocked(getCachedChapters).mockResolvedValue([]);
    await open("/library");
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
    expect(view!.container.querySelector('[data-testid="route"]')).toBeNull();
  });

  it("does not unlock offline routes for metadata with no pages", async () => {
    vi.mocked(getCachedChapters).mockResolvedValue([{ ...chapter, pageCount: 0, pages: [] }]);
    await open("/library");
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
    expect(view!.container.querySelector('[data-testid="route"]')).toBeNull();
  });

  it("does not use another server's cached availability after a profile switch", async () => {
    vi.mocked(getCachedChapters).mockImplementation(async (url) => url === server ? [chapter] : []);
    await open("/reader/12");
    await waitForRender(() => expect(view!.container.querySelector('[data-testid="route"]')).not.toBeNull());
    await act(async () => { useSettingsStore.setState({ serverBaseUrl: "http://other.example:4567" }); });
    expect(view!.container.querySelector('[data-testid="route"]')).toBeNull();
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
    expect(getCachedChapters).toHaveBeenCalledWith("http://other.example:4567");
  });

  it("keeps onboarding recoverable if cache lookup fails", async () => {
    vi.mocked(getCachedChapters).mockRejectedValue(new Error("Storage unavailable"));
    await open("/library");
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
  });

  it("ignores a previous profile's cache lookup that finishes after switching", async () => {
    let resolvePrevious!: (chapters: CachedChapter[]) => void;
    const previousLookup = new Promise<CachedChapter[]>((resolve) => { resolvePrevious = resolve; });
    vi.mocked(getCachedChapters).mockImplementation(async (url) => url === server ? previousLookup : []);
    await open("/reader/12");
    await act(async () => { useSettingsStore.setState({ serverBaseUrl: "http://other.example:4567" }); });
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
    await act(async () => resolvePrevious([chapter]));
    expect(view!.container.querySelector('[data-testid="route"]')).toBeNull();
  });

  it("does not query every server's cache when the configured URL is empty", async () => {
    useSettingsStore.setState({ serverBaseUrl: "" });
    await open("/library");
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
    expect(getCachedChapters).not.toHaveBeenCalled();
  });

  it("keeps server-only routes behind onboarding when disconnected", async () => {
    await open("/browse/search");
    await waitForRender(() => expect(view!.container.querySelector("h1")?.textContent?.trim()).toBe("Yomikura"));
  });

  it.each(["/settings", "/settings/server"])("keeps %s accessible without a server", async (path) => {
    vi.mocked(getCachedChapters).mockResolvedValue([]);
    await open(path);
    expect(view!.container.querySelector('[data-testid="route"]')).not.toBeNull();
  });

  it.each(["connected", "demo"])("does not gate %s browsing on cache availability", async (mode) => {
    useSettingsStore.setState({ connectionStatus: mode === "connected" ? "connected" : "disconnected", mockMode: mode === "demo" });
    await open("/browse/search");
    expect(view!.container.querySelector('[data-testid="route"]')).not.toBeNull();
    expect(getCachedChapters).not.toHaveBeenCalled();
  });
});
