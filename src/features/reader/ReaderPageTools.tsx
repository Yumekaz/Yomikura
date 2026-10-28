import { useEffect, useRef, useState } from "react";
import { Download, MoreHorizontal, RotateCw } from "lucide-react";
import { useReaderImageSource } from "./useReaderImageSource";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import type { ReaderChapter } from "./readerChapter";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../../api/suwayomi/pageUrls";
import { assertExportBackend, downloadExport, nativeExport, rasterizeNativeSvg, readExportPage, safeExportName } from "./readerExport";
import { createPageArchive, type ArchivePage } from "./pageArchive";

export function pageImageFilename(title: string, page: number, mime: string) {
  const clean = safeExportName(title);
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" } as Record<string, string>)[mime.split(";")[0]] ?? "img";
  return `${clean} - Page ${Math.max(1, Math.floor(page))}.${extension}`;
}
export function ReaderPageTools({ open, onToggle, onClose, url, title, page, onRotate, chapter, backend }: { open: boolean; onToggle: () => void; onClose: () => void; url: string; title: string; page: number; onRotate: () => void; chapter: ReaderChapter; backend: ProgressBackend }) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const { url: resolved } = useReaderImageSource(open ? url : "");
  const { notify } = useFeedback(); const [busy, setBusy] = useState(false), [progress, setProgress] = useState("");
  const folders = useSettingsStore((state) => state.experience.reader.exportTitleFolders), controller = useRef<AbortController>();
  useEffect(() => { if (!open) controller.current?.abort(); return () => controller.current?.abort(); }, [open]);
  useEffect(() => { if (!open) return; menu.current?.querySelector<HTMLButtonElement>("button")?.focus(); const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); }; document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside); }, [open, onClose]);
  const save = async (archive: boolean) => {
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort; setBusy(true);
    try {
      const native = isTauri(), urls = archive ? chapter.pages.map((source, index) => backend.isDemo ? resolveBackendUrl(backend.serverBaseUrl, source) : buildSuwayomiPageUrl({ serverBaseUrl: backend.serverBaseUrl, mangaId: chapter.mangaId, chapterSourceOrder: chapter.sourceOrder, pageIndex: index })) : [url];
      const pages: ArchivePage[] = []; let bytes = 0;
      for (let index = 0; index < urls.length; index++) {
        setProgress(`Preparing ${index + 1} of ${urls.length}…`);
        let blob = await readExportPage(urls[index], backend, abort.signal); if (native) blob = await rasterizeNativeSvg(blob);
        bytes += blob.size; if (bytes > 128 * 1024 * 1024) throw new Error("This export exceeds 128 MB. Save individual pages instead.");
        const filename = pageImageFilename(native ? chapter.name : title, archive ? index + 1 : page, blob.type), extension = filename.split(".").pop()!;
        pages.push({ name: archive ? `${String(index + 1).padStart(4, "0")}.${extension}` : filename, blob });
      }
      assertExportBackend(backend, abort.signal); setProgress("Preparing archive…");
      const blob = archive ? await createPageArchive(pages, abort.signal) : pages[0].blob;
      const name = archive ? `${safeExportName(`${title} - ${chapter.name}`, 150)}.cbz` : pages[0].name;
      setProgress("Saving export…");
      if (native) { if (!await nativeExport(blob, name, folders ? safeExportName(title) : null, archive, backend, abort.signal)) { notify("Export cancelled.", "info"); return; } }
      else { assertExportBackend(backend, abort.signal); downloadExport(blob, name); }
      onClose(); notify(native ? "Export saved and verified in your chosen folder." : `${archive ? "Chapter" : "Page"} sent to your downloads.`, "success");
    } catch (error) { notify(abort.signal.aborted ? "Export cancelled." : error instanceof Error ? error.message : "This export couldn’t be saved. Try again.", abort.signal.aborted ? "info" : "error"); }
    finally { setBusy(false); setProgress(""); }
  };
  return <div ref={root} className="yomi-reader-page-tools"><button ref={trigger} type="button" className="yomi-icon-button" aria-label="Page actions" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}><MoreHorizontal /></button>{open && <div ref={menu} role="menu" aria-label={`Page ${page} actions`} className="yomi-context-menu" onKeyDown={(event) => { const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a")]; if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); trigger.current?.focus(); } else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const current = items.indexOf(document.activeElement as HTMLElement); items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); } }}><span className="yomi-reader-menu-label">Page {page}</span><button role="menuitem" type="button" disabled={!resolved || busy} onClick={() => void save(false)}><Download />Save page</button><button role="menuitem" type="button" disabled={!chapter.pages.length || busy} onClick={() => void save(true)}><Download />Export chapter as CBZ</button>{busy && <><span role="status" className="yomi-reader-menu-label">{progress}</span><button role="menuitem" type="button" onClick={() => controller.current?.abort()}>Cancel export</button></>}<button role="menuitem" type="button" disabled={busy} onClick={() => { onRotate(); onClose(); }}><RotateCw />Rotate clockwise</button><a role="menuitem" href={url} target="_blank" rel="noopener noreferrer" onClick={onClose}>Open image</a></div>}</div>;
}
