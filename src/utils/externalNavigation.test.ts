// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installNativeExternalLinks, openExternalInDesktop, safeExternalUrl } from "./externalNavigation";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
let uninstall = () => {};
const notify = vi.fn();
const external = "https://docs.example/guide?chapter=5&view=full";
function desktop() { Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} }); }
function anchor(url = external) {
  const link = document.createElement("a"); link.href = url; link.textContent = "Read help"; document.body.append(link); return link;
}
function click(target: Element, init: MouseEventInit = {}, type = "click") {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(event); return event;
}
beforeEach(() => {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost:3000/");
  vi.clearAllMocks(); native.invoke.mockResolvedValue(undefined);
});
afterEach(() => { uninstall(); uninstall = () => {}; document.body.replaceChildren(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; vi.restoreAllMocks(); });

it("accepts only strict HTTP(S) addresses and preserves query data", async () => {
  expect(safeExternalUrl(external)).toBe(external);
  expect(safeExternalUrl("http://example.com")).toBe("http://example.com/");
  for (const value of [null, {}, "", "/library", "//example.com", "javascript:alert(1)", "file:///C:/Windows/System32/cmd.exe", "data:text/html,hello", "mailto:help@example.com", "https://user:secret@example.com", "https://user@example.com", "https://exam\nple.com", "https://example.com/\0"]) expect(safeExternalUrl(value)).toBeUndefined();
  await expect(openExternalInDesktop("file:///unsafe")).rejects.toThrow(/valid source/);
  expect(native.invoke).not.toHaveBeenCalled();
  await openExternalInDesktop(external);
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith("open_source_website", { url: external });
});

it("leaves ordinary website links and their default behavior untouched", async () => {
  uninstall = installNativeExternalLinks(notify);
  const event = click(anchor());
  expect(event.defaultPrevented).toBe(false);
  await Promise.resolve();
  expect(native.invoke).not.toHaveBeenCalled();
});

it("opens an SVG child link once while native handoff is pending", async () => {
  desktop();
  let complete!: () => void;
  native.invoke.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
  uninstall = installNativeExternalLinks(notify);
  const link = anchor();
  link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>';
  // Middle-click exercises SVG delegation without happy-dom's premature
  // primary-anchor navigation; primary/keyboard clicks are covered below.
  expect(click(link.querySelector("path")!, { button: 1 }, "auxclick").defaultPrevented).toBe(true);
  expect(click(link, { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(click(link, { button: 1 }, "auxclick").defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
  expect(link.getAttribute("aria-busy")).toBe("true");
  complete();
  await vi.waitFor(() => expect(link.hasAttribute("aria-busy")).toBe(false));
  expect(notify).not.toHaveBeenCalled();
});

it.each([{ detail: 0 }, { ctrlKey: true }, { shiftKey: true }, { metaKey: true }])("handles keyboard and modified primary clicks: %j", async (init) => {
  desktop(); uninstall = installNativeExternalLinks(notify);
  expect(click(anchor(), init).defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith("open_source_website", { url: external }));
});

it("ignores internal routes, already handled links, right clicks and unsafe addresses", async () => {
  desktop(); uninstall = installNativeExternalLinks(notify);
  for (const value of ["/library", "#reading", `${window.location.origin}/settings`, "javascript:alert(1)", "mailto:help@example.com", "https://user:secret@example.com", "https://exam\nple.com"]) expect(click(anchor(value)).defaultPrevented).toBe(false);
  const handled = anchor(); handled.addEventListener("click", (event) => event.preventDefault());
  expect(click(handled).defaultPrevented).toBe(true);
  expect(click(anchor(), { button: 2 }, "auxclick").defaultPrevented).toBe(false);
  expect(click(anchor(), { button: 2 }).defaultPrevented).toBe(false);
  await Promise.resolve(); expect(native.invoke).not.toHaveBeenCalled();
});

it("handles middle clicks without allowing WebView navigation", async () => {
  desktop(); uninstall = installNativeExternalLinks(notify);
  expect(click(anchor(), { button: 1 }, "auxclick").defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith("open_source_website", { url: external }));
});

it("reports failed native handoff with copy-link recovery and allows retry", async () => {
  desktop(); native.invoke.mockRejectedValueOnce(new Error("No registered browser")); uninstall = installNativeExternalLinks(notify);
  const link = anchor(); expect(click(link).defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(notify).toHaveBeenCalledExactlyOnceWith("Your browser couldn’t open this link. Copy the link and open it in your browser.", "error"));
  await vi.waitFor(() => expect(link.hasAttribute("aria-busy")).toBe(false));
  expect(click(link).defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(2));
});

it("removes both document listeners on cleanup", async () => {
  desktop(); uninstall = installNativeExternalLinks(notify); uninstall();
  const link = anchor(); expect(click(link).defaultPrevented).toBe(false);
  expect(click(link, { button: 1 }, "auxclick").defaultPrevented).toBe(false);
  await Promise.resolve(); expect(native.invoke).not.toHaveBeenCalled();
});
