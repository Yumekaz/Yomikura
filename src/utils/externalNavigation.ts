const hiddenControls = /[\u0000-\u001f\u007f]/;

export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || hiddenControls.test(value)) return;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return; }
}

export async function openExternalInDesktop(value: string): Promise<void> {
  const url = safeExternalUrl(value);
  if (!url) throw new Error("This is not a valid source website link.");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_source_website", { url });
}

/** The WebView does not hand external anchors to the operating-system browser. */
export function installNativeExternalLinks(notify: (message: string, tone: "error") => void): () => void {
  if (!("__TAURI_INTERNALS__" in window)) return () => {};
  const pending = new WeakSet<HTMLAnchorElement>();
  const open = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== (event.type === "click" ? 0 : 1)) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    // Check the original attribute too: URL parsing can discard hidden controls.
    const url = anchor && !hiddenControls.test(anchor.getAttribute("href") ?? "") && safeExternalUrl(anchor.href);
    if (!url || anchor!.origin === window.location.origin) return;
    event.preventDefault();
    if (pending.has(anchor!)) return;
    pending.add(anchor!); anchor!.setAttribute("aria-busy", "true");
    void openExternalInDesktop(url).catch(() => notify("Your browser couldn’t open this link. Copy the link and open it in your browser.", "error"))
      .finally(() => { pending.delete(anchor!); anchor!.removeAttribute("aria-busy"); });
  };
  document.addEventListener("click", open);
  document.addEventListener("auxclick", open);
  return () => { document.removeEventListener("click", open); document.removeEventListener("auxclick", open); };
}
