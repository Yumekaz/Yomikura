import { useEffect, useRef, useState } from "react";
import { belongsToLibrary, getCachedChapters, getDownloadJobs, isDemoCacheRecord, type CachedChapter, type DownloadJob } from "../../api/suwayomi/offlineCache";
import { getBookNoteDrafts, type BookNoteDraft } from "../../features/manga/bookNoteStorage";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { rememberedLibrary } from "../../api/suwayomi/librarySession";
import { downloadNoteExport } from "../../features/manga/notePortability";
import { getEarlierProgress, type ProgressHead } from "../../api/suwayomi/progressStorage";

/** Recovery never fetches page URLs or sends archived drafts to a server. */
export function EarlierLibraryData() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const [open, setOpen] = useState(false), [chapters, setChapters] = useState<CachedChapter[]>([]), [notes, setNotes] = useState<BookNoteDraft[]>([]), [error, setError] = useState("");
  const [reading, setReading] = useState<CachedChapter>(), [page, setPage] = useState(0), [images, setImages] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<ProgressHead[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  useEffect(() => {
    if (!reading) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setReading(undefined); }
      if (event.key !== "Tab") return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const next = buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
      if (next) { event.preventDefault(); next.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [reading]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([getCachedChapters(), getBookNoteDrafts(), getEarlierProgress(serverBaseUrl), getDownloadJobs()]).then(([saved, drafts, earlierProgress, earlierJobs]) => {
      if (!active) return;
      setChapters(saved.filter((chapter) => !isDemoCacheRecord(chapter) && (chapter.serverBaseUrl !== serverBaseUrl || !belongsToLibrary(chapter, serverBaseUrl))));
      setProgress(earlierProgress);
      setJobs(earlierJobs.filter((job) => !isDemoCacheRecord(job) && (job.serverBaseUrl !== serverBaseUrl || !belongsToLibrary(job, serverBaseUrl))));
      setNotes(drafts.filter((draft) => { try { const [backend, , , marker] = JSON.parse(draft.key); const [mode, url] = JSON.parse(backend); return mode === "live" && (url !== serverBaseUrl || marker !== rememberedLibrary(serverBaseUrl)?.marker); } catch { return false; } }));
    }).catch(() => { if (active) setError("Earlier saved data could not be opened. It has not been removed."); });
    return () => { active = false; };
  }, [open, serverBaseUrl]);
  useEffect(() => {
    let active = true; const objectUrls: string[] = [];
    setImages([]); setError("");
    if (reading) void (async () => {
      const cache = await caches.open("yomikura-page-cache");
      const tiles = reading.pageTiles?.find((item) => item.index === page)?.tiles;
      const urls = tiles?.length ? tiles.map((tile) => tile.url) : [reading.cachedUrls[page] ?? reading.pages[page]];
      for (const url of urls) {
        const response = await cache.match(url);
        if (!response) throw new Error("This saved page is missing from device storage. Its record is retained.");
        const objectUrl = URL.createObjectURL(await response.blob());
        if (!active) { URL.revokeObjectURL(objectUrl); return; }
        objectUrls.push(objectUrl);
      }
      if (active) setImages([...objectUrls]);
    })().catch((problem) => { if (active) setError(problem instanceof Error ? problem.message : "Saved page unavailable."); });
    return () => { active = false; for (const url of objectUrls) URL.revokeObjectURL(url); };
  }, [reading, page]);
  if (mockMode) return null;
  return <details className="yomi-content-surface p-5" onToggle={(event) => { setOpen(event.currentTarget.open); if (!event.currentTarget.open) setReading(undefined); }}><summary className="cursor-pointer font-semibold">Earlier saved libraries</summary><p className="my-3 text-sm text-slate-400">Saved chapters and notes with a different or unverified library origin stay here. Pages open from device storage only; they do not change your connected library.</p>
    {error && <p role="alert" className="my-3 text-sm">{error}</p>}
    {open && !chapters.length && !notes.length && !progress.length && !jobs.length && <p className="text-sm text-slate-400">No earlier saved chapters or notes found.</p>}
    {!!jobs.length && <div className="my-3"><h4 className="text-sm font-semibold">Earlier download attempts</h4><ul className="mt-2 space-y-2 text-sm text-slate-400">{jobs.map((job) => <li key={job.jobKey}>{job.mangaTitle || "Saved chapter download"} · {job.status === "failed" ? "Interrupted" : "Paused"} · kept for review</li>)}</ul></div>}
    {!!progress.length && <div className="my-3"><p className="text-sm text-slate-400">{progress.length} earlier chapter progress records are retained for review. Exporting them does not apply them to your connected library.</p><button className="yomi-button yomi-button-secondary mt-2" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "yomikura-earlier-progress", version: 1, progress }, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "yomikura-earlier-progress.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    }}>Export earlier progress</button></div>}
    <ul className="space-y-3">{chapters.map((chapter) => <li key={chapter.cacheKey} className="rounded-md border border-white/10 p-3"><p>{chapter.mangaTitle} · {chapter.name}</p><small className="text-slate-400">{chapter.libraryId ? "Earlier library" : "Origin unverified"}</small><button className="yomi-button yomi-button-secondary ml-3" onClick={() => { setPage(Math.max(0, Math.min(chapter.lastPageRead ?? 0, chapter.pageCount - 1))); setReading(chapter); setError(""); }}>Read saved copy</button></li>)}</ul>
    <ul className="mt-3 space-y-3">{notes.map((draft) => { const [, mangaId, title] = JSON.parse(draft.key); return <li key={draft.key} className="rounded-md border border-white/10 p-3"><p>{title}</p><p className="my-2 whitespace-pre-wrap text-sm text-slate-400">{draft.value}</p><button className="yomi-button yomi-button-secondary" onClick={() => downloadNoteExport(JSON.stringify({ format: "yomikura-notes", version: 1, createdAt: new Date().toISOString(), notes: [{ mangaId, title, value: draft.value }] }))}>Export this note</button></li>; })}</ul>
    {reading && <div role="dialog" aria-modal="true" aria-label="Earlier saved chapter" ref={dialog} className="fixed inset-0 z-[100] flex flex-col bg-ink-950 p-4"><div className="flex flex-wrap items-center justify-between gap-3 pb-3"><p>{reading.mangaTitle} · {reading.name} · Saved copy</p><button className="yomi-button yomi-button-secondary" onClick={() => setReading(undefined)}>Close saved reader</button></div><div className="flex-1 overflow-auto text-center">{error ? <p role="alert">{error}</p> : images.length ? images.map((url, index) => <img key={url} src={url} alt={`Saved page ${page + 1}${images.length > 1 ? ` · part ${index + 1}` : ""}`} loading="lazy" onError={() => setError("This saved image could not be displayed. Its stored bytes are retained.")} className="mx-auto max-w-full" />) : <p role="status">Opening saved page…</p>}</div><div className="flex items-center justify-between gap-3 pt-3"><button className="yomi-button yomi-button-secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous page</button><p>{page + 1} of {reading.pageCount}</p><button className="yomi-button yomi-button-secondary" disabled={page >= reading.pageCount - 1} onClick={() => setPage((value) => value + 1)}>Next page</button></div></div>}
  </details>;
}
