// @vitest-environment happy-dom
import { act, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReaderImage } from "./ReaderImage";
import { ReaderZoomContext, useReaderZoom } from "./useReaderZoom";
import { render } from "../../test/render";

vi.mock("./useReaderImageSource", () => ({ useReaderImageSource: (url: string) => ({ url, reload: () => {} }) }));
let view: Awaited<ReturnType<typeof render>> | undefined;
function Fixture() {
  const root = useRef<HTMLDivElement>(null);
  const zoom = useReaderZoom(root, true, false);
  return <ReaderZoomContext.Provider value={zoom}><div ref={(node) => { root.current = node; zoom.onSurfaceRef(node); }}>
    <button onClick={() => zoom.change(.5)}>Zoom out</button><button onClick={() => zoom.change(2)}>Zoom in</button>
    <ReaderImage url="https://fixture.example/page" pageNumber={0} />
  </div></ReaderZoomContext.Provider>;
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {});
});
afterEach(async () => { await view?.unmount(); view = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function prepare() {
  view = await render(<Fixture />);
  const image = view.container.querySelector("img")!;
  Object.defineProperties(image, { naturalWidth: { value: 600, configurable: true }, naturalHeight: { value: 1000, configurable: true } });
  await act(async () => image.dispatchEvent(new Event("load", { bubbles: true })));
  return { image, frame: view.container.querySelector<HTMLElement>("[data-image-zoom]")! };
}
async function choose(name: string) {
  const button = [...view!.container.querySelectorAll("button")].find((node) => node.textContent === name)!;
  await act(async () => button.click());
}
function touches(type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  view!.container.querySelector("img")!.dispatchEvent(event);
}

it("keeps vertical touch scrolling available when the webtoon strip is zoomed out", async () => {
  const { frame } = await prepare();
  await choose("Zoom out");
  expect(frame.getAttribute("data-image-zoom")).toBe("0.50");
  expect(frame.style.touchAction).toBe("pan-y");
});

it("does not add one-finger drag scrolling while the same two touches are pinching", async () => {
  const { image } = await prepare();
  await choose("Zoom in");
  const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  await act(async () => {
    image.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true, pointerType: "touch", pointerId: 1, clientX: 100, clientY: 200 }));
    touches("touchstart", [[100, 200], [200, 200]]);
    image.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, isPrimary: true, pointerType: "touch", pointerId: 1, clientX: 80, clientY: 170 }));
  });
  expect(scroll).not.toHaveBeenCalled();
});
