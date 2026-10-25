import { ThemedSelect } from "../../components/ui/ThemedSelect";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Download, HardDriveDownload, Loader2, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { isTauri, useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { useFeedback } from "../../components/ui/FeedbackProvider";
import { formatChapterDate } from "./chapterDate";
import { invalidateChapterState } from "../../api/suwayomi/chapterState";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { writeChapterProgress } from "../../api/suwayomi/progressSync";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { mangaReaderSettingsKey } from "../../stores/mangaReaderSettings";
import { normalizeChapterPolicy, selectChapters, type ChapterFilter } from "./chapterPolicy";

export interface Chapter {
  id: string | number;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  isDownloaded: boolean;
  uploadDate: string | number;
  scanlator?: string | null;
  sourceOrder?: number;
}

interface ChapterListProps {
  chapters: Chapter[];
  mangaTitle?: string;
  mangaId?: number;
  offline?: boolean;
}

export function ChapterList({ chapters, mangaTitle, mangaId, offline = false }: ChapterListProps) {
  const { confirm, notify } = useFeedback();
  const queryClient = useQueryClient();
  const { serverBaseUrl, mockMode, chapterPolicies, setChapterPolicy } = useSettingsStore();
  const keepsLocalCopy = isTauri() || mockMode;
  const { activeDownloads, cachedChapterIds, downloadChapter, retryDownload, cancelDownload, deleteChapter } = useDownloadStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const sdk = useMemo(() => createGraphqlClient(`${serverBaseUrl.replace(/\/$/, "")}/api/graphql`), [serverBaseUrl]);
  const backend = useProgressBackend();
  const policy = normalizeChapterPolicy(backend && mangaId !== undefined ? chapterPolicies[mangaReaderSettingsKey(backend, mangaId)] : undefined);
  const { filter, scanlator } = policy;
  const changePolicy = (patch: Partial<typeof policy>) => { if (backend && mangaId !== undefined) setChapterPolicy(mangaId, { ...policy, ...patch }, backend); setSelected(new Set()); setSelecting(false); };
  const localProgress = useQuery({ queryKey: ["progress-local", backend?.key], queryFn: () => getProgressHeads(backend!), enabled: !!backend, retry: false });
  const sortedChapters = useMemo(() => chapters.map((chapter) => {
    const saved = localProgress.data?.find((head) => head.chapter.chapterId === Number(chapter.id) && head.chapter.mangaId === mangaId
      && head.chapter.mangaTitle === mangaTitle && head.chapter.chapterName === chapter.name && head.chapter.chapterNumber === chapter.chapterNumber);
    return saved && (offline || backend?.isDemo || saved.sequence > saved.acknowledgedSequence) ? { ...chapter, isRead: saved.patch.isRead } : chapter;
  }), [chapters, localProgress.data, mangaId, mangaTitle, offline, backend]);
  const scanlators = useMemo(() => [...new Set(chapters.map((chapter) => chapter.scanlator).filter((value): value is string => !!value))].sort(), [chapters]);
  const missingCount = useMemo(() => {
    const wholeNumbers = [...new Set(chapters.map((chapter) => chapter.chapterNumber).filter(Number.isInteger))].sort((a, b) => a - b);
    let missing = 0;
    for (let index = 1; index < wholeNumbers.length; index += 1) missing += Math.max(0, wholeNumbers[index] - wholeNumbers[index - 1] - 1);
    return missing;
  }, [chapters]);
  const visibleChapters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return selectChapters(sortedChapters, policy, cachedChapterIds).filter((chapter) => {
      if (normalized && !`${chapter.name} ${chapter.chapterNumber} ${chapter.scanlator || ""}`.toLowerCase().includes(normalized)) return false;
      return true;
    });
  }, [cachedChapterIds, policy.sort, policy.descending, filter, query, scanlator, sortedChapters]);

  const toggleSelected = (chapterId: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
    return next;
  });

  const updateSelected = async (patch: { isRead?: boolean; isBookmarked?: boolean; lastPageRead?: number }) => {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      let pending = 0;
      const backend = progressBackend(serverBaseUrl, mockMode);
      await Promise.all([...selected].map(async (id) => {
        if (patch.isRead !== undefined || patch.lastPageRead !== undefined) {
          const chapter = chapters.find((item) => Number(item.id) === id);
          const result = await writeChapterProgress(backend, id, patch, { fallback: chapter && mangaId !== undefined && mangaTitle ? { chapterId: id, chapterName: chapter.name, chapterNumber: chapter.chapterNumber, mangaId, mangaTitle, pageCount: 0 } : undefined });
          if (!result.acknowledged) pending += 1;
        } else await sdk.UpdateChapterProgress({ input: { id, patch } });
      }));
      setSelected(new Set());
      setSelecting(false);
      await invalidateChapterState(queryClient);
      notify(pending ? `${selected.size} chapters saved on this device; ${pending} waiting to synchronize.` : `${selected.size} chapters updated.`, pending ? "info" : "success");
    } catch (error: any) {
      await invalidateChapterState(queryClient);
      notify(error?.message || "Chapter update failed.", "error");
    } finally {
      setBulkBusy(false);
    }
  };

  const downloadSelected = async () => {
    const target = progressBackend(serverBaseUrl, mockMode);
    for (const id of selected) await downloadChapter(id, mangaTitle, target);
    notify(`${selected.size} chapters added to the persistent download queue.`, "success");
    setSelected(new Set());
    setSelecting(false);
  };

  return (
    <div className="flex flex-col">
      <div className="yomi-chapter-controls space-y-3 border-b border-white/10 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-lg font-semibold text-slate-100">{chapters.length} {chapters.length === 1 ? "Chapter" : "Chapters"}</h3>{missingCount > 0 && <p className="mt-1 text-xs text-amber-300">{missingCount} possible missing chapter{missingCount === 1 ? "" : "s"} detected</p>}</div>
          {visibleChapters.length > 0 && (selecting ? <div className="flex items-center gap-2" role="group" aria-label="Chapter selection"><button type="button" className="yomi-button yomi-button-secondary" onClick={() => setSelected(selected.size === visibleChapters.length ? new Set() : new Set(visibleChapters.map((chapter) => Number(chapter.id))))}>{selected.size === visibleChapters.length ? "Clear selection" : "Select visible"}</button><button type="button" className="yomi-button yomi-button-primary" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Done</button></div> : <button type="button" className="yomi-button yomi-button-secondary" onClick={() => setSelecting(true)}>Select chapters</button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_170px]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search chapters</span><input className="yomi-field w-full !pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters…" /></label>
          <ThemedSelect className="yomi-field" aria-label="Filter chapter status" value={filter} onValueChange={(value) => changePolicy({ filter: value as ChapterFilter })}><option value="all">All chapters</option><option value="unread">Unread</option><option value="bookmarked">Bookmarked</option><option value="downloaded">Downloaded</option></ThemedSelect>
          <ThemedSelect className="yomi-field" aria-label="Filter scanlator" value={scanlator} onValueChange={(value) => changePolicy({ scanlator: value })}><option value="all">All scanlators</option>{scanlators.map((name) => <option key={name} value={name}>{name}</option>)}</ThemedSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2"><ThemedSelect className="yomi-field !w-auto" aria-label="Chapter reading order" value={policy.sort} onValueChange={(value) => changePolicy({ sort: value as typeof policy.sort })}><option value="number">Chapter number</option><option value="source">Source order</option><option value="date">Publication date</option></ThemedSelect><button type="button" className="yomi-button yomi-button-secondary" aria-pressed={policy.descending} onClick={() => changePolicy({ descending: !policy.descending })}>{policy.descending ? "Descending chapters" : "Ascending chapters"}</button><span className="text-xs text-slate-400">Resume starts at the first unread chapter.</span></div>
        {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-ink-950/50 p-3"><span className="mr-2 text-xs font-semibold text-slate-300">{selected.size} selected</span><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isRead: true })}>Mark read</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isRead: false, lastPageRead: 0 })}>Mark unread</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-secondary" onClick={() => void updateSelected({ isBookmarked: true })}><Bookmark />Bookmark</button><button type="button" disabled={bulkBusy} className="yomi-button yomi-button-primary" onClick={() => void downloadSelected()}><Download />Download</button></div>}
      </div>

      <div className="flex flex-col divide-y divide-white/5">
        {visibleChapters.map((chapter) => {
          const chapterId = Number(chapter.id);
          const isCached = cachedChapterIds.has(chapterId);
          const download = activeDownloads[chapterId];
          const content = <><span className={`block truncate font-medium ${chapter.isRead ? "text-slate-400" : "text-slate-200"}`}>{chapter.name}</span><span className="yomi-chapter-meta">{chapter.isRead && <span className="yomi-chapter-read"><Check aria-hidden="true" />Read</span>}<span>{formatChapterDate(chapter.uploadDate)}</span>{chapter.scanlator && <><span aria-hidden="true">·</span><span className="truncate">{chapter.scanlator}</span></>}</span></>;
          return (
            <div key={chapter.id} className={`yomi-chapter-row ${selected.has(chapterId) ? "is-selected" : ""}`}>
              {selecting && <label className="yomi-chapter-check"><input type="checkbox" checked={selected.has(chapterId)} onChange={() => toggleSelected(chapterId)} aria-label={`Select ${chapter.name}`} /><span aria-hidden="true"><Check /></span></label>}
              {selecting ? <button type="button" onClick={() => toggleSelected(chapterId)} className="yomi-chapter-content" aria-label={`Toggle selection for ${chapter.name}`}>{content}</button> : <Link to={`/reader/${chapter.id}`} className="yomi-chapter-content">{content}</Link>}
              {!selecting && <div className="flex shrink-0 items-center gap-2">
                {chapter.isBookmarked && <Bookmark className="h-4 w-4 fill-current text-amber-300" aria-label="Bookmarked" />}
                {chapter.isDownloaded && <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-slate-400" title="Downloaded on server"><Download className="h-4 w-4" /></span>}
                {isCached ? <button onClick={async () => { if (await confirm({ title: "Remove offline chapter?", detail: `Delete the saved pages for “${chapter.name}” from this device?`, confirmLabel: "Remove download", danger: true })) await deleteChapter(chapterId, backend ?? undefined); }} className="yomi-icon-button" title="Saved on this device" aria-label={`Remove offline download of ${chapter.name}`}><HardDriveDownload /></button>
                  : download?.status === "downloading" || download?.status === "queued" ? <button onClick={() => cancelDownload(chapterId, backend ?? undefined)} className="yomi-icon-button" aria-label={`Cancel download of ${chapter.name}`}>{download.status === "downloading" ? <Loader2 className="animate-spin" /> : <X />}</button>
                  : download?.status === "error" ? <button onClick={() => void retryDownload(chapterId, mangaTitle, backend ?? undefined)} className="yomi-icon-button danger" aria-label={`Retry download of ${chapter.name}`}><Download /></button>
                  : <button onClick={async () => { try { await downloadChapter(chapterId, mangaTitle, backend ?? undefined); if (!keepsLocalCopy) { notify("Chapter added to Suwayomi's download queue.", "success"); queryClient.invalidateQueries({ queryKey: ["downloads"] }); } } catch (error) { notify(error instanceof Error ? error.message : "Download could not be started.", "error"); } }} className="yomi-icon-button" aria-label={keepsLocalCopy ? `Save ${chapter.name} for offline reading` : `Download ${chapter.name} through Suwayomi`}><Download /></button>}
              </div>}
            </div>
          );
        })}
        {visibleChapters.length === 0 && <div className="py-12 text-center text-sm text-slate-400">{chapters.length ? "No chapters match these filters." : "No chapters available."}</div>}
      </div>
    </div>
  );
}
