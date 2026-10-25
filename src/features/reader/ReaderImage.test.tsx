// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitForRender } from "../../test/render";
import { ReaderImage } from "./ReaderImage";

type Observation = {
  target?: Element;
  callback: IntersectionObserverCallback;
  disconnect: () => void;
};
let observations: Observation[];
let view: Awaited<ReturnType<typeof render>> | undefined;

beforeEach(() => {
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
    expect(observations[0].target).toBe(images[0].parentElement);
    expect(observations[1].target).toBe(images[1].parentElement);
    expect(images[0].parentElement!.id).not.toBe(images[1].parentElement!.id);
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
