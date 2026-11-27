// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { render, waitForRender } from "../../test/render";
import { ChapterList, type Chapter } from "./ChapterList";

const mocks = vi.hoisted(() => ({ progress: vi.fn(), download: vi.fn() }));
vi.mock("../../stores/useDownloadStore", () => ({
  useDownloadStore: () => ({ activeDownloads: {}, cachedChapterIds: new Set(), downloadChapter: mocks.download }),
}));
vi.mock("../../hooks/useProgressSynchronization", () => ({ useProgressBackend: () => null }));
vi.mock("../../components/ui/FeedbackProvider", () => ({ useFeedback: () => ({ confirm: vi.fn(), notify: vi.fn() }) }));
vi.mock("../../api/suwayomi/progressSync", () => ({ writeChapterProgress: mocks.progress }));
vi.mock("../../api/suwayomi/chapterState", () => ({ invalidateChapterState: vi.fn() }));

let view: Awaited<ReturnType<typeof render>> | undefined;
let client: QueryClient | undefined;
afterEach(async () => {
  await view?.unmount();
  client?.clear();
  vi.resetAllMocks();
});

async function fixture() {
  const chapters: Chapter[] = ["Courier", "Garden"].map((name, index) => ({
    id: index + 1, name, chapterNumber: index + 1, isRead: true, isBookmarked: false,
    isDownloaded: false, uploadDate: "2026-11-26", lastPageRead: 2, pageCount: 3,
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  view = await render(<QueryClientProvider client={client}><MemoryRouter>
    <ChapterList mangaTitle="Story" mangaId={22} chapters={chapters} />
  </MemoryRouter></QueryClientProvider>);
  const container = view.container;
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === text);
  const click = async (text: string) => {
    const control = button(text);
    expect(control, text).toBeDefined();
    await act(async () => control!.click());
  };
  const search = async (query: string) => {
    const field = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, query);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  return { container, button, click, search };
}

it("scopes chapter mutations and downloads to visible selected IDs", async () => {
  const { container, button, click, search } = await fixture();
  mocks.progress.mockResolvedValue({ acknowledged: true });
  await click("Select chapters");
  await act(async () => container.querySelector<HTMLInputElement>('[aria-label="Select Courier"]')!.click());
  await search("Garden");
  expect(container.textContent).toContain("0 visible selected · 1 hidden and excluded");
  expect(button("Mark unread")?.disabled).toBe(true);
  expect(button("Download")?.disabled).toBe(true);
  expect(button("Select visible")).toBeDefined();
  await click("Select visible");
  expect(button("Deselect visible")).toBeDefined();
  await click("Deselect visible");
  expect(button("Select visible")).toBeDefined();
  await click("Select visible");
  await click("Mark unread");
  await waitForRender(() => expect(button("Mark unread")?.disabled).toBe(true));
  expect(mocks.progress.mock.calls.map((args) => args[1])).toEqual([2]);
  await click("Select visible");
  await click("Download");
  await waitForRender(() => expect(button("Download")?.disabled).toBe(true));
  expect(mocks.download.mock.calls.map((args) => args[0])).toEqual([2]);
  await search("");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Select Courier"]')!.checked).toBe(true);
  expect(container.querySelector<HTMLInputElement>('[aria-label="Select Garden"]')!.checked).toBe(false);
});
