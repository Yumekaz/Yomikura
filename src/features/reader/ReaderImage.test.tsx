// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitForRender } from "../../test/render";
import { ReaderImage } from "./ReaderImage";
import { LibraryCover } from "../../components/library/LibraryCover";
import { useSettingsStore } from "../../stores/useSettingsStore";

const media = vi.hoisted(() => ({ match: vi.fn(), read: vi.fn(), revision: 0 }));
vi.mock("../../api/suwayomi/desktopAuth", () => ({
  isProtectedLibraryImage: media.match,
  protectedImage: media.read,
  useDesktopAuthRevision: () => media.revision,
}));

type Observation = {
  target?: Element;
  callback: IntersectionObserverCallback;
  disconnect: () => void;
};
let observations: Observation[];
let view: Awaited<ReturnType<typeof render>> | undefined;

beforeEach(() => {
  media.match.mockReset().mockReturnValue(false);
  media.read.mockReset();
  media.revision = 0;
  observations = [];
  vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
  vi.stubGlobal("IntersectionObserver", class {
    observation: Observation;
    constructor(callback: IntersectionObserverCallback) {
      this.observation = { callback, disconnect: vi.fn() };
      observations.push(this.observation);
    }
    observe(target: Element) { this.observation.target = target; }
    disconnect() { this.observation.disconnect(); }
  });
});

it("uses only session-bound blobs for protected pages and lazy covers", async () => {
  const serverBaseUrl = "https://books.example/yomikura";
  const page = serverBaseUrl + "/api/v1/manga/4/chapter/2/page/0";
  const cover = serverBaseUrl + "/api/v1/manga/4/thumbnail";
  const prior = useSettingsStore.getState();
  const next = { serverBaseUrl, mockMode: false, connectionStatus: "connected" as const };
  media.match.mockImplementation((url: string, base: string) => base === serverBaseUrl && url.startsWith(base + "/api/"));
  const pageBlob = new Blob(["page"], { type: "image/png" });
  const coverBlob = new Blob(["cover"], { type: "image/png" });
  media.read.mockImplementation((url: string) => Promise.resolve(url === page ? pageBlob : coverBlob));
  const objectUrl = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => blob === pageBlob ? "blob:authenticated-page" : "blob:authenticated-cover");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const screen = <><ReaderImage url={page} pageNumber={0} /><LibraryCover cache={false} src={cover} loading="lazy" alt="Cover" /></>;
  try {
    useSettingsStore.setState(next);
    view = await render(screen);
    await waitForRender(() => expect(view!.container.querySelector('[alt="Page 1"]')?.getAttribute("src")).toBe("blob:authenticated-page"));
    const thumb = view.container.querySelector('[alt="Cover"]');
    expect(thumb?.getAttribute("src")).toBeNull();
    expect(media.read.mock.calls.map(([url]) => url)).toEqual([page]);
    await act(async () => intersect(observations.find((entry) => entry.target === thumb)!));
    await waitForRender(() => expect(thumb?.getAttribute("src")).toBe("blob:authenticated-cover"));
    expect(media.read).toHaveBeenLastCalledWith(cover, serverBaseUrl, expect.any(AbortSignal));
    media.revision++;
    media.match.mockReturnValue(false);
    await view.rerender(<><ReaderImage url={page} pageNumber={0} /><LibraryCover cache={false} src={cover} loading="lazy" alt="Cover" /></>);
    expect(revoke).toHaveBeenCalledWith("blob:authenticated-page");
    expect(revoke).toHaveBeenCalledWith("blob:authenticated-cover");
  } finally {
    await view?.unmount();
    view = undefined;
    useSettingsStore.setState(prior);
    objectUrl.mockRestore();
    revoke.mockRestore();
  }
});

describe("reader image readiness", () => {
  it("does not report loading or failed pages as ready, and clears readiness on unmount", async () => {
    const ready = vi.fn();
    view = await render(<ReaderImage url="https://pages.example/one.jpg" pageNumber={0} onReadyChange={ready} />);
    expect(ready).toHaveBeenLastCalledWith(false);
    const img = view.container.querySelector("img")!;
    await waitForRender(() => expect(img.src).toBe("https://pages.example/one.jpg"));
    await act(async () => img.dispatchEvent(new Event("load")));
    expect(ready).toHaveBeenLastCalledWith(true);
    await act(async () => img.dispatchEvent(new Event("error")));
    expect(ready).toHaveBeenLastCalledWith(false);
    await view.unmount();
    view = undefined;
    expect(ready).toHaveBeenLastCalledWith(false);
  });

  it("requires the replacement image to load even when the page number stays the same", async () => {
    const ready = vi.fn();
    view = await render(<ReaderImage url="https://pages.example/one.jpg" pageNumber={0} onReadyChange={ready} />);
    const img = view.container.querySelector("img")!;
    await waitForRender(() => expect(img.src).toContain("one.jpg"));
    await act(async () => img.dispatchEvent(new Event("load")));
    expect(ready).toHaveBeenLastCalledWith(true);
    await view.rerender(<ReaderImage url="https://pages.example/two.jpg" pageNumber={0} onReadyChange={ready} />);
    expect(ready).toHaveBeenLastCalledWith(false);
    await waitForRender(() => expect(img.src).toContain("two.jpg"));
    expect(ready).toHaveBeenLastCalledWith(false);
    await act(async () => img.dispatchEvent(new Event("load")));
    expect(ready).toHaveBeenLastCalledWith(true);
  });
});

afterEach(async () => {
  await view?.unmount();
  view = undefined;
  vi.unstubAllGlobals();
});

function intersect(observation: Observation) {
  observation.callback([{ isIntersecting: true, target: observation.target } as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe("reader image visibility ownership", () => {
  it("observes each chapter's own page zero and uses unique element IDs", async () => {
    const first = vi.fn();
    const second = vi.fn();
    view = await render(<>
      <ReaderImage url="https://pages.example/chapter-1/0.jpg" pageNumber={0} onIntersect={first} />
      <ReaderImage url="https://pages.example/chapter-2/0.jpg" pageNumber={0} onIntersect={second} />
    </>);
    const images = view.container.querySelectorAll("img");
    expect(observations).toHaveLength(2);
    expect(observations[0].target).toBe(images[0].closest('[id^="reader-page-"]'));
    expect(observations[1].target).toBe(images[1].closest('[id^="reader-page-"]'));
    expect(observations[0].target!.id).not.toBe(observations[1].target!.id);
    await act(async () => intersect(observations[1]));
    expect(second).toHaveBeenCalledWith(0);
    expect(first).not.toHaveBeenCalled();
  });

  it("disconnects replaced/unmounted observers and uses the current page callback", async () => {
    const previous = vi.fn();
    const current = vi.fn();
    view = await render(<ReaderImage url="https://pages.example/page.jpg" pageNumber={0} onIntersect={previous} />);
    const originalElement = observations[0].target;
    const originalId = originalElement!.id;
    await view.rerender(<ReaderImage url="https://pages.example/page.jpg" pageNumber={1} onIntersect={current} />);
    expect(observations[0].disconnect).toHaveBeenCalledOnce();
    expect(observations[1].target).toBe(originalElement);
    expect(originalElement!.id).toBe(originalId);
    await act(async () => intersect(observations[1]));
    expect(current).toHaveBeenCalledWith(1);
    expect(previous).not.toHaveBeenCalled();
    await view.unmount();
    view = undefined;
    expect(observations[1].disconnect).toHaveBeenCalledOnce();
  });
});
