// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { FeedbackProvider } from "../../components/ui/FeedbackProvider";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { FetchSourceMangaType } from "../../api/graphql/generated/graphql";
import { render, waitForRender } from "../../test/render";
import GlobalSearchPage from "./GlobalSearchPage";
import SourceBrowsePage from "./SourceBrowsePage";

const sdk = vi.hoisted(() => ({
  GetInstalledExtensionLangs: vi.fn(), GetSourcesByCondition: vi.fn(),
  GetSources: vi.fn(), GetSourceFilters: vi.fn(), FetchSourceManga: vi.fn(),
}));
vi.mock("../../api/graphql/client", () => ({ createGraphqlClient: () => sdk }));

let view: Awaited<ReturnType<typeof render>> | undefined;
let client: QueryClient;
const source = { id: "100", name: "Test source", lang: "en", supportsLatest: true };

function HistoryControls() {
  const navigate = useNavigate();
  return <>
    <button data-testid="back" onClick={() => navigate(-1)}>Back</button>
    <button data-testid="forward" onClick={() => navigate(1)}>Forward</button>
  </>;
}

async function open(path: string) {
  view = await render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <FeedbackProvider>
          <HistoryControls />
          <Routes>
            <Route path="/browse/search" element={<GlobalSearchPage />} />
            <Route path="/browse/:sourceId" element={<SourceBrowsePage />} />
          </Routes>
        </FeedbackProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function click(element: Element) {
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })); });
}

function showAllLink() {
  return [...view!.container.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Show all");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), serverBaseUrl: "http://server.example" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sdk.GetInstalledExtensionLangs.mockResolvedValue({ extensions: { nodes: [{ lang: "en" }] } });
  sdk.GetSourcesByCondition.mockImplementation(async ({ lang }) => ({ sources: { nodes: lang === "en" ? [source] : [] } }));
  sdk.GetSources.mockResolvedValue({ sources: { nodes: [source] } });
  sdk.GetSourceFilters.mockResolvedValue({ source: { ...source, filters: [] } });
  sdk.FetchSourceManga.mockResolvedValue({ fetchSourceManga: { mangas: [{ id: 1, title: "Test result" }], hasNextPage: false } });
});

afterEach(async () => {
  await view?.unmount();
  view = undefined;
  client.clear();
});

describe("global-to-source search navigation", () => {
  it.each(["Moonlit Courier", "海賊 / #1? +100%"])("keeps %s through Show all and history navigation", async (query) => {
    await open(`/browse/search?q=${encodeURIComponent(query)}`);
    await waitForRender(() => expect(showAllLink()).toBeDefined());
    const href = new URL(showAllLink()!.href);
    expect(href.searchParams.get("query")).toBe(query);
    sdk.FetchSourceManga.mockClear();
    await click(showAllLink()!);
    await waitForRender(() => expect(sdk.FetchSourceManga).toHaveBeenLastCalledWith({
      input: { source: "100", page: 1, type: FetchSourceMangaType.Search, query },
    }));
    expect((view!.container.querySelector("form input") as HTMLInputElement).value).toBe(query);
    await click(view!.container.querySelector('[data-testid="back"]')!);
    await waitForRender(() => expect(showAllLink()).toBeDefined());
    sdk.FetchSourceManga.mockClear();
    await click(view!.container.querySelector('[data-testid="forward"]')!);
    await waitForRender(() => expect(sdk.FetchSourceManga).toHaveBeenLastCalledWith({
      input: { source: "100", page: 1, type: FetchSourceMangaType.Search, query },
    }));
  });

  it.each(["query", "search"])("accepts existing direct links using %s", async (parameter) => {
    const query = "Old & new links";
    await open(`/browse/100?${parameter}=${encodeURIComponent(query)}`);
    await waitForRender(() => expect(sdk.FetchSourceManga).toHaveBeenLastCalledWith({
      input: { source: "100", page: 1, type: FetchSourceMangaType.Search, query },
    }));
  });

  it("prefers an explicit canonical query even when it is empty", async () => {
    await open("/browse/100?query=&search=stale");
    await waitForRender(() => expect(sdk.FetchSourceManga).toHaveBeenLastCalledWith({
      input: { source: "100", page: 1, type: FetchSourceMangaType.Popular, query: undefined },
    }));
  });
});
