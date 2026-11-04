// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import { ReaderEndStatus } from "./ReaderEndStatus";

let view: Awaited<ReturnType<typeof render>> | undefined;
afterEach(async () => { await view?.unmount(); view = undefined; });
const defaults = { chapterName: "Chapter 59", mangaId: 42, state: "caught-up" as const, finished: true, pagesReady: true, onCheck: vi.fn() };
it("offers a non-mutating check and chapter-list return at the confirmed end", async () => {
  const check = vi.fn();
  view = await render(<MemoryRouter><ReaderEndStatus {...defaults} onCheck={check} /></MemoryRouter>);
  expect(view.container.textContent).toContain("Finished");
  expect(view.container.textContent).toContain("There’s no next chapter.");
  expect(view.container.querySelector('a')?.getAttribute("href")).toBe("/manga/42");
  await act(async () => view!.container.querySelector("button")!.click());
  expect(check).toHaveBeenCalledOnce();
});
it("failed or pending images never produce a Finished or caught-up announcement", async () => {
  view = await render(<MemoryRouter><ReaderEndStatus {...defaults} pagesReady={false} pagesFailed /></MemoryRouter>);
  expect(view.container.textContent).toContain("Some pages couldn’t be loaded.");
  expect(view.container.textContent).not.toContain("Finished");
  expect(view.container.textContent).not.toContain("There’s no next chapter.");
  await view.rerender(<MemoryRouter><ReaderEndStatus {...defaults} pagesReady={false} /></MemoryRouter>);
  expect(view.container.textContent).toContain("Waiting for the final page");
  expect(view.container.textContent).not.toContain("Finished");
});
it("an eligible new chapter replaces the no-next announcement without resetting the reader", async () => {
  const next = vi.fn();
  view = await render(<MemoryRouter><ReaderEndStatus {...defaults} /></MemoryRouter>);
  await view.rerender(<MemoryRouter><ReaderEndStatus {...defaults} state="next" onNext={next} /></MemoryRouter>);
  expect(view.container.textContent).not.toContain("There’s no next chapter.");
  expect(view.container.textContent).toContain("Next chapter");
  await act(async () => view!.container.querySelector("button")!.click());
  expect(next).toHaveBeenCalledOnce();
});
