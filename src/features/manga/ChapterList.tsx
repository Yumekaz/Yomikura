import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, CheckCircle2, Circle, Download, Loader2, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { formatChapterDate } from "./chapterDate";

export interface Chapter {
  id: string | number;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  isDownloaded: boolean;
  uploadDate: string | number;
  scanlator?: string | null;
}

interface ChapterListProps {
  chapters: Chapter[];
  mangaTitle?: string;
}

type ChapterFilter = "all" | "unread" | "bookmarked" | "downloaded";

export function ChapterList({ chapters, mangaTitle }: ChapterListProps) {
  const { confirm, notify } = useFeedback();
  const queryClient = useQueryClient();
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const keepsLocalCopy = isTauri() || mockMode;
  const { activeDownloads, cachedChapterIds, downloadChapter, retryDownload, cancelDownload, deleteChapter } = useDownloadStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChapterFilter>("all");
  const [scanlator, setScanlator] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`), [serverBaseUrl]);
  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => b.chapterNumber - a.chapterNumber), [chapters]);
  const scanlators = useMemo(() => [...new Set(chapters.map((chapter) => chapter.scanlator).filter((value): value is string => !!value))].sort(), [chapters]);
  const missingCount = useMemo(() => {
    const wholeNumbers = [...new Set(chapters.map((chapter) => chapter.chapterNumber).filter(Number.isInteger))].sort((a, b) => a - b);
    let missing = 0;
    for (let index = 1; index < wholeNumbers.length; index += 1) missing += Math.max(0, wholeNumbers[index] - wholeNumbers[index - 1] - 1);
    return missing;
  }, [chapters]);
  const visibleChapters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortedChapters.filter((chapter) => {
      if (normalized && !`${chapter.name} ${chapter.chapterNumber} ${chapter.scanlator || ""}`.toLowerCase().includes(normalized)) return false;
      if (scanlator !== "all" && chapter.scanlator !== scanlator) return false;
      if (filter === "unread" && chapter.isRead) return false;
      if (filter === "bookmarked" && !chapter.isBookmarked) return false;
      if (filter === "downloaded" && !chapter.isDownloaded && !cachedChapterIds.has(Number(chapter.id))) return false;
      return true;
    });
  }, [cachedChapterIds, filter, query, scanlator, sortedChapters]);

  const toggleSelected = (chapterId: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
    return next;
  });

  const updateSelected = async (patch: { isRead?: boolean; isBookmarked?: boolean; lastPageRead?: number }) => {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => sdk.UpdateChapterProgress({ input: { id, patch } })));
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["manga"] });
      notify(`${selected.size} chapters updated.`, "success");
    } catch (error: any) {
      notify(error?.message || "Chapter update failed.", "error");
    } finally {
      setBulkBusy(false);
    }
  };

  const downloadSelected = async () => {
    for (const id of selected) await downloadChapter(id, mangaTitle);
    notify(`${selected.size} chapters added to the persistent download queue.`, "success");
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-4 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-lg font-semibold text-slate-100">{chapters.length} Chapters</h3>{missingCount > 0 && <p className="mt-1 text-xs text-amber-300">{missingCount} possible missing chapter{missingCount === 1 ? "" : "s"} detected</p>}</div>
          {visibleChapters.length > 0 && <button type="button" className="yomi-button yomi-button-secondary" onClick={() => setSelected(selected.size === visibleChapters.length ? new Set() : new Set(visibleChapters.map((chapter) => Number(chapter.id))))}>{selected.size === visibleChapters.length ? "Clear selection" : "Select visible"}</button>}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_170px]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search chapters</span><input className="yomi-field w-full !pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters…" /></label>
          <select className="yomi-field" aria-label="Filter chapter status" value={filter} onChange={(event) => setFilter(event.target.value as ChapterFilter)}><option value="all">All chapters</option><option value="unread">Unread</option><option value="bookmarked">Bookmarked</option><option value="downloaded">Downloaded</option></select>
          <select className="yomi-field" aria-label="Filter scanlator" value={scanlator} onChange={(event) => setScanlator(event.target.value)}><option value="all">All scanlators</option>{scanlators.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        </div>
        {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-ink-950/50 p-3"><span className="mr-2 text-xs font-semibold text-slate-300">{selected.size} selected</span><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isRead: true })}>Mark read</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isRead: false, lastPageRead: 0 })}>Mark unread</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isBookmarked: true })}><Bookmark />Bookmark</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-primary" onClick={() => void downloadSelected()}><Download />Download</button></div>}
      </div>

      <div className="flex flex-col divide-y divide-white/5">
        {visibleChapters.map((chapter) => {
          const chapterId = Number(chapter.id);
          const isCached = cachedChapterIds.has(chapterId);
          const download = activeDownloads[chapterId];
          return (
            <div key={chapter.id} className={`flex items-center gap-3 px-5 py-3 transition-[background-color,opacity] duration-150 hover:bg-white/[0.035] ${chapter.isRead ? "bg-white/[0.02] opacity-60" : "opacity-100"}`}>
              <input type="checkbox" checked={selected.has(chapterId)} onChange={() => toggleSelected(chapterId)} aria-label={`Select ${chapter.name}`} className="h-4 w-4 shrink-0 rounded border-white/15 bg-ink-950 text-yomi-jade" />
              <Link to={`/reader/${chapter.id}`} className="flex min-w-0 flex-1 items-start gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yomi-signature))]">
                <span className="mt-1 shrink-0 text-slate-400">{chapter.isRead ? <CheckCircle2 className="h-5 w-5 text-yomi-jade" /> : <Circle className="h-5 w-5" />}</span>
                <span className="min-w-0"><span className={`block truncate font-medium ${chapter.isRead ? "text-slate-400" : "text-slate-200"}`}>{chapter.name}</span><span className="mt-1 flex items-center gap-2 text-xs text-slate-400"><span>{formatChapterDate(chapter.uploadDate)}</span>{chapter.scanlator && <><span>•</span><span className="truncate">{chapter.scanlator}</span></>}</span></span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {chapter.isBookmarked && <Bookmark className="h-4 w-4 fill-current text-amber-300" aria-label="Bookmarked" />}
                {chapter.isDownloaded && <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-slate-400" title="Downloaded on server"><Download className="h-4 w-4" /></span>}
                {isCached ? <button onClick={async () => { if (await confirm({ title: "Remove offline chapter?", detail: `Delete the saved pages for “${chapter.name}” from this device?`, confirmLabel: "Remove download", danger: true })) await deleteChapter(chapterId); }} className="yomi-icon-button" aria-label={`Remove offline download of ${chapter.name}`}><CheckCircle2 /></button>
                  : download?.status === "downloading" || download?.status === "queued" ? <button onClick={() => cancelDownload(chapterId)} className="yomi-icon-button" aria-label={`Cancel download of ${chapter.name}`}>{download.status === "downloading" ? <Loader2 className="animate-spin" /> : <X />}</button>
                  : download?.status === "error" ? <button onClick={() => void retryDownload(chapterId, mangaTitle)} className="yomi-icon-button danger" aria-label={`Retry download of ${chapter.name}`}><Download /></button>
                  : <button onClick={async () => { try { await downloadChapter(chapterId, mangaTitle); if (!keepsLocalCopy) { notify("Chapter added to Suwayomi's download queue.", "success"); queryClient.invalidateQueries({ queryKey: ["downloads"] }); } } catch (error) { notify(error instanceof Error ? error.message : "Download could not be started.", "error"); } }} className="yomi-icon-button" aria-label={keepsLocalCopy ? `Save ${chapter.name} for offline reading` : `Download ${chapter.name} through Suwayomi`}><Download /></button>}
              </div>
            </div>
          );
        })}
        {visibleChapters.length === 0 && <div className="py-12 text-center text-sm text-slate-400">{chapters.length ? "No chapters match these filters." : "No chapters available."}</div>}
      </div>
    </div>
  );
}
