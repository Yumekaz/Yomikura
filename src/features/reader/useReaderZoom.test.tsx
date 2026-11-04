// @vitest-environment happy-dom
import { act, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReaderZoomContext, boundedReaderZoom, useReaderZoom } from "./useReaderZoom";
import { ReaderImage } from "./ReaderImage";
import { render } from "../../test/render";

vi.mock("./useReaderImageSource", () => ({ useReaderImageSource: (url: string) => ({ url, reload: () => {} }) }));
let view: Awaited<ReturnType<typeof render>> | undefined;
function Harness({ disableZoomOut = false }: { disableZoomOut?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [extra, setExtra] = useState(false);
  const zoom = useReaderZoom(root, true, disableZoomOut);
  return <ReaderZoomContext.Provider value={zoom}><div ref={root}>
    <button onClick={() => zoom.change(2)}>Enlarge</button><button onClick={() => zoom.change(.5)}>Shrink</button><button onClick={zoom.reset}>Reset all</button><button onClick={() => setExtra(true)}>Append</button>
    <ReaderImage url="https://fixture.test/one" pageNumber={0} /><ReaderImage url="https://fixture.test/two" pageNumber={1} />{extra && <ReaderImage url="https://fixture.test/three" pageNumber={2} />}
  </div></ReaderZoomContext.Provider>;
}
const zooms = () => [...view!.container.querySelectorAll("[data-image-zoom]")].map((image) => image.getAttribute("data-image-zoom"));
async function press(name: string) { const button = [...view!.container.querySelectorAll("button")].find((node) => node.textContent === name)!; await act(async () => button.click()); }
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); });
afterEach(async () => { await view?.unmount(); view = undefined; vi.unstubAllGlobals(); });
it("bounds invalid/extreme scales and respects disabling zoom-out", () => {
  expect([boundedReaderZoom(-5), boundedReaderZoom(99), boundedReaderZoom(NaN), boundedReaderZoom(.5, true)]).toEqual([.5, 4, 1, 1]);
});
it("shares zoom across visible pages and newly appended images, then double-click resets all", async () => {
  view = await render(<Harness />); await press("Enlarge"); expect(zooms()).toEqual(["2.00", "2.00"]);
  await press("Append"); expect(zooms()).toEqual(["2.00", "2.00", "2.00"]);
  await act(async () => view!.container.querySelector("img")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  expect(zooms()).toEqual(["1.00", "1.00", "1.00"]);
  await press("Shrink"); expect(zooms()).toEqual(["0.50", "0.50", "0.50"]); await press("Reset all"); expect(zooms()).toEqual(["1.00", "1.00", "1.00"]);
});
it("never shrinks below fit when zoom-out is disabled", async () => { view = await render(<Harness disableZoomOut />); await press("Shrink"); expect(zooms()).toEqual(["1.00", "1.00"]); });
function touch(type: string, points: [number, number][]) {
  const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, "touches", { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  view!.container.querySelector("img")!.dispatchEvent(event); return event;
}
it("pinches the shared strip, resets with a double tap, and ignores the compatibility double-click", async () => {
  view = await render(<Harness />);
  await act(async () => { touch("touchstart", [[0, 100], [100, 100]]); touch("touchmove", [[0, 100], [200, 100]]); touch("touchend", []); }); expect(zooms()).toEqual(["2.00", "2.00"]);
  await act(async () => { touch("touchstart", [[100, 100]]); touch("touchend", []); touch("touchstart", [[100, 100]]); touch("touchend", []); }); expect(zooms()).toEqual(["1.00", "1.00"]);
  await act(async () => view!.container.querySelector("img")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))); expect(zooms()).toEqual(["1.00", "1.00"]);
});
