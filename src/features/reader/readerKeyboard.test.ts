// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { readerShortcutAllowed } from "./readerKeyboard";
function allowed(html: string, options: KeyboardEventInit = {}) {
  const host = document.createElement("div"); host.innerHTML = html; document.body.append(host); let result = true;
  host.addEventListener("keydown", (event) => { result = readerShortcutAllowed(event); });
  host.querySelector("span")!.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true, ...options })); host.remove(); return result;
}
it.each(['<button><span/></button>', '<a href="#"><span/></a>', '<div role="slider"><span/></div>', '<div contenteditable="plaintext-only"><span/></div>', '<div role="dialog"><span/></div>'])("suppresses reader keys inside %s", (html) => { expect(allowed(html)).toBe(false); });
it("preserves browser shortcuts and allows ordinary reader-surface shortcuts", () => { expect(allowed("<span/>", { ctrlKey: true })).toBe(false); expect(allowed("<span/>", { altKey: true })).toBe(false); expect(allowed("<span/>")).toBe(true); });
