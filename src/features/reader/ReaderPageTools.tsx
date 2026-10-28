import { useEffect, useRef, useState } from "react";
import { Download, MoreHorizontal, RotateCw } from "lucide-react";
import { useReaderImageSource } from "./useReaderImageSource";
import { useFeedback } from "../../components/ui/FeedbackProvider";

export function pageImageFilename(title: string, page: number, mime: string) {
  const clean = title.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 100) || "Yomikura";
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" } as Record<string, string>)[mime.split(";")[0]] ?? "img";
  return `${clean} - Page ${Math.max(1, Math.floor(page))}.${extension}`;
}
export function ReaderPageTools({ open, onToggle, onClose, url, title, page, onRotate }: { open: boolean; onToggle: () => void; onClose: () => void; url: string; title: string; page: number; onRotate: () => void }) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const { url: resolved } = useReaderImageSource(open ? url : "");
  const { notify } = useFeedback(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; menu.current?.querySelector<HTMLButtonElement>("button")?.focus(); const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); }; document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, [open, onClose]);
  const save = async () => {
    if (!resolved) return; setBusy(true);
    try {
      const response = await fetch(resolved, { signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error("Page unavailable");
      const blob = await response.blob(); if (!blob.type.startsWith("image/") || blob.size === 0) throw new Error("Not an image");
      const source = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = source; anchor.download = pageImageFilename(title, page, blob.type); document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(source), 30_000);
      onClose(); notify("Page sent to your downloads.", "success");
    } catch { notify("This page couldn’t be saved. Try opening the image and saving it there.", "error"); }
    finally { setBusy(false); }
  };
  return <div ref={root} className="yomi-reader-page-tools"><button ref={trigger} type="button" className="yomi-icon-button" aria-label="Page actions" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}><MoreHorizontal /></button>{open && <div ref={menu} role="menu" aria-label={`Page ${page} actions`} className="yomi-context-menu" onKeyDown={(event) => { const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a")]; if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); trigger.current?.focus(); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const current = items.indexOf(document.activeElement as HTMLElement); items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); } }}><span className="yomi-reader-menu-label">Page {page}</span><button role="menuitem" type="button" disabled={!resolved || busy} onClick={() => void save()}><Download />{busy ? "Saving page…" : "Save page"}</button><button role="menuitem" type="button" onClick={() => { onRotate(); onClose(); }}><RotateCw />Rotate clockwise</button><a role="menuitem" href={url} target="_blank" rel="noopener noreferrer" onClick={onClose}>Open image</a></div>}</div>;
}
