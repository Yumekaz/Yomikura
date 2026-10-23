import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSettingsStore, FitMode, PageSpread, ReaderMode } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { classifySourceProblem, getErrorMessage } from "../../api/suwayomi/errors";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../../api/suwayomi/pageUrls";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { useTranslation } from "../../hooks/useTranslation";
import { ReaderImage } from "./ReaderImage";
import { ReaderOverlay } from "./ReaderOverlay";
import { createProgressSnapshot, type ProgressSnapshot } from "./readerProgress";
import { progressBackend, type ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { saveProgressIntent } from "../../api/suwayomi/progressSync";
import { loadReaderChapter, loadReaderChapterDetails, loadReaderChapterPages, readerChapter, type ReaderChapter } from "./readerChapter";
import { WebtoonPage } from "./WebtoonPage";
import { useWebtoonNavigation, type ReaderCursor } from "./useWebtoonNavigation";
import { isCurrentProgressBackend } from "../../api/suwayomi/progressSync";
import { mangaReaderSettingsKey } from "../../stores/mangaReaderSettings";
import type { ImageFilters, MangaOverride } from "../../stores/useSettingsStore";

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const location = useLocation();
  const newToken = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const [session, setSession] = useState(() => ({ startId: chapterId!, token: newToken(), entryKey: location.key }));
  if (location.key !== session.entryKey && location.state?.readerSession !== session.token) {
    setSession({ startId: chapterId!, token: newToken(), entryKey: location.key });
    return null;
  }
  return <ReaderSession key={session.token} startChapterId={session.startId} sessionToken={session.token} />;
}

function ReaderSession({ startChapterId: chapterId, sessionToken }: { startChapterId: string; sessionToken: string }) {
  const { chapterId: routeChapterId } = useParams<{ chapterId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Settings store global values & setters
  const { 
    serverBaseUrl, 
    mockMode,
    readerMode: globalReaderMode, 
    setReaderMode: setGlobalReaderMode, 
    fitMode: globalFitMode, 
    setFitMode: setGlobalFitMode, 
    pageSpread: globalPageSpread, 
    setPageSpread: setGlobalPageSpread,
    mangaSettingsOverrides,
    setMangaOverride,
    clearMangaOverride,
    autoScrollSpeed,
    autoDownloadCount,
    customKeybinds,
    autoDeleteReadChapters,
    infiniteChapterReading,
    imageFilters: globalImageFilters,
    setImageFilters: setGlobalImageFilters,
    cropBorders: globalCropBorders,
    setCropBorders: setGlobalCropBorders,
    pageTransition: globalPageTransition,
    setPageTransition: setGlobalPageTransition,
    setAutoDownloadCount: setGlobalAutoDownloadCount,
    readerNavigationMode,
  } = useSettingsStore();

  const { downloadChapter, cachedChapters } = useDownloadStore();

  const [showOverlay, setShowOverlay] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const lastSavedPagesRef = useRef(new Map<number, number>());
  const [progressSaveError, setProgressSaveError] = useState("");
  const failedProgressRef = useRef<{ backend: ProgressBackend; progress: ProgressSnapshot } | null>(null);
  const scrollRef = useRef<number | null>(null);
  const autoScrollEndTriggered = useRef(false);
  const bingeLoadingRef = useRef(false);

  type StreamChapter = ReaderChapter;
  const readyPagesRef = useRef(new Set<string>());
  const [readyPageVersion, setReadyPageVersion] = useState(0);
  const pageIdentity = useCallback((id: number, index: number) => `${serverBaseUrl}::${id}::${index}`, [serverBaseUrl]);
  const [streamChapters, setStreamChapters] = useState<StreamChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const activeChapter = streamChapters.find((item) => item.id === activeChapterId) ?? streamChapters[0];
  const initialized = useRef(false);
  const streamRef = useRef(streamChapters); streamRef.current = streamChapters;
  const cursorRef = useRef<ReaderCursor>({ chapterId: Number(chapterId), pageIndex: 0 });
  const locationRef = useRef(location); locationRef.current = location;
  const lastWrittenCursor = useRef("");
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  const [appendError, setAppendError] = useState("");
  const [appending, setAppending] = useState(false);
  const tailAnchor = useRef<HTMLDivElement>(null);
  const sessionController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); sessionController.current = controller;
    return () => { controller.abort(); if (sessionController.current === controller) sessionController.current = null; };
  }, []);
  const progressTarget = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);

  // Fetch chapter details
  const { data: chapterData, isLoading: chapterLoading, isError: chapterError, error: chapterErrorObject } = useQuery({
    queryKey: ["chapter", chapterId, progressTarget.key, sessionToken],
    queryFn: async ({ signal }) => ({ chapter: await loadReaderChapterDetails(progressTarget, Number(chapterId), signal) }),
    enabled: !!serverBaseUrl && !!chapterId,
  });

  const chapter = chapterData?.chapter;
  const mangaId = activeChapter?.mangaId ?? chapter?.mangaId;

  // Resolve Overrides
  const overrideKey = mangaId !== undefined ? mangaReaderSettingsKey(progressTarget, mangaId) : undefined;
  const override = overrideKey !== undefined ? mangaSettingsOverrides[overrideKey] : undefined;
  const hasOverride = override !== undefined;
  const readerMode = override?.readerMode ?? globalReaderMode;
  const fitMode = override?.fitMode ?? globalFitMode;
  const pageSpread = override?.pageSpread ?? globalPageSpread;
  const pageTransition = override?.pageTransition ?? globalPageTransition;
  const effectiveAutoDownloadCount = override?.autoDownloadCount ?? autoDownloadCount;
  const effectiveImageFilters = override?.imageFilters
    ? { ...globalImageFilters, ...override.imageFilters }
    : globalImageFilters;
  const effectiveCropBorders = override?.cropBorders ?? globalCropBorders;

  const handleReaderModeChange = useCallback((mode: ReaderMode) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { readerMode: mode }, progressTarget);
    } else {
      setGlobalReaderMode(mode);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalReaderMode, progressTarget]);

  const handleFitModeChange = useCallback((mode: FitMode) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { fitMode: mode }, progressTarget);
    } else {
      setGlobalFitMode(mode);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalFitMode, progressTarget]);

  const handlePageSpreadChange = useCallback((spread: PageSpread) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { pageSpread: spread }, progressTarget);
    } else {
      setGlobalPageSpread(spread);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalPageSpread, progressTarget]);

  const changeTitleSetting = useCallback((patch: MangaOverride) => {
    if (mangaId !== undefined && hasOverride) setMangaOverride(mangaId, patch, progressTarget);
    else {
      if (patch.imageFilters) setGlobalImageFilters(patch.imageFilters);
      if (patch.cropBorders !== undefined) setGlobalCropBorders(patch.cropBorders);
      if (patch.pageTransition !== undefined) setGlobalPageTransition(patch.pageTransition);
      if (patch.autoDownloadCount !== undefined) setGlobalAutoDownloadCount(patch.autoDownloadCount);
    }
  }, [mangaId, hasOverride, progressTarget, setMangaOverride, setGlobalImageFilters, setGlobalCropBorders, setGlobalPageTransition, setGlobalAutoDownloadCount]);

  const handleToggleOverride = useCallback(() => {
    if (mangaId === undefined) return;
    if (hasOverride) {
      clearMangaOverride(mangaId, progressTarget);
    } else {
      setMangaOverride(mangaId, {
        readerMode,
        fitMode,
        pageSpread,
        pageTransition,
        autoDownloadCount: effectiveAutoDownloadCount,
        imageFilters: effectiveImageFilters,
        cropBorders: effectiveCropBorders,
      }, progressTarget);
    }
  }, [
    mangaId,
    hasOverride,
    clearMangaOverride,
    setMangaOverride,
    readerMode,
    fitMode,
    pageSpread,
    pageTransition,
    effectiveAutoDownloadCount,
    effectiveImageFilters,
    effectiveCropBorders,
    progressTarget,
  ]);

  const { data: pagesData, isLoading: pagesLoading, isError: pagesError, error: pagesErrorObject } = useQuery({
    queryKey: ["reader-pages", chapterId, progressTarget.key, sessionToken],
    queryFn: ({ signal }) => loadReaderChapterPages(progressTarget, Number(chapterId), chapter!, signal),
    enabled: !!chapter, staleTime: Infinity, refetchOnWindowFocus: false,
  });

  const updateProgress = useCallback(async (backend: ProgressBackend, progress: ProgressSnapshot) => {
    try {
      const atEnd = progress.pageCount > 0 && progress.pageIndex >= progress.pageCount - 1;
      const result = await saveProgressIntent(backend, {
        kind: "reading", chapter: { chapterId: progress.chapterId, chapterName: progress.chapterName, chapterNumber: progress.chapterNumber, mangaId: progress.mangaId, mangaTitle: progress.mangaTitle, pageCount: progress.pageCount, sourceOrder: progress.sourceOrder },
        epoch: progress.progressEpoch, baseline: progress.baseline,
        patch: { lastPageRead: progress.pageIndex, isRead: progress.wasRead || atEnd },
        deleteAfterAck: autoDeleteReadChapters && atEnd,
      });
      if (!result.accepted) {
        setProgressSaveError(result.reason === "identity" ? "The saved progress belongs to an earlier chapter record. Review pending progress before saving this chapter." : "Progress was reset in another view. Reopen this chapter to begin a new reading session.");
        return;
      }
      failedProgressRef.current = null;
      setProgressSaveError("");
    } catch {
      failedProgressRef.current = { backend, progress };
      lastSavedPagesRef.current.delete(progress.chapterId);
      setProgressSaveError("Reading progress could not be saved on this device. Check storage and retry before closing the reader.");
    }
  }, [autoDeleteReadChapters]);

  const rootPages = pagesData ?? [];
  const pages = activeChapter?.pages ?? rootPages;
  const pageProblem = chapterError || pagesError ? classifySourceProblem(chapterErrorObject ?? pagesErrorObject) : null;

  const retryReaderLoad = useCallback(() => {
    navigate(`/reader/${routeChapterId}`, { replace: true, state: null });
  }, [navigate, routeChapterId]);

  // Compute Sibling Chapters
  const siblingChapters = useMemo(() => {
    if (!chapter?.manga?.chapters?.edges) return [];
    return chapter.manga.chapters.edges
      .map(e => e?.node)
      .filter((n): n is NonNullable<typeof n> => n != null)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }, [chapter]);

  const { prevChapterId, nextChapterId } = useMemo(() => {
    if (!activeChapter || siblingChapters.length === 0) return {};
    const idx = siblingChapters.findIndex(c => c.id === activeChapter.id);
    return {
      prevChapterId: idx > 0 ? siblingChapters[idx - 1].id : undefined,
      nextChapterId: idx >= 0 && idx < siblingChapters.length - 1 ? siblingChapters[idx + 1].id : undefined,
    };
  }, [activeChapter, siblingChapters]);

  // Auto-Download Queue effect
  useEffect(() => {
    if (!activeChapter || effectiveAutoDownloadCount <= 0 || siblingChapters.length === 0) return;

    const idx = siblingChapters.findIndex(c => c.id === activeChapter.id);
    if (idx === -1) return;

    const nextChapters = siblingChapters.slice(idx + 1, idx + 1 + effectiveAutoDownloadCount);

    const triggerDownloads = async () => {
      for (const ch of nextChapters) {
        if (!isCurrentProgressBackend(progressTarget)) break;
        const isAlreadyDownloaded = cachedChapters?.some(cc => cc.id === ch.id);
        if (!isAlreadyDownloaded) {
          try {
            await downloadChapter(ch.id, activeChapter.mangaTitle);
          } catch (err) {
            console.error("Failed background auto-download for chapter:", ch.id, err);
          }
        }
      }
    };

    void triggerDownloads();
  }, [activeChapter?.id, effectiveAutoDownloadCount, siblingChapters, cachedChapters, downloadChapter, progressTarget]);

  const getNextSiblingId = useCallback(
    (afterChapterId: number) => {
      const idx = siblingChapters.findIndex((c) => c.id === afterChapterId);
      if (idx < 0 || idx >= siblingChapters.length - 1) return undefined;
      return siblingChapters[idx + 1].id;
    },
    [siblingChapters]
  );

  const appendNextBingeChapter = useCallback(async () => {
    const tail = streamChapters[streamChapters.length - 1];
    if (!tail || bingeLoadingRef.current) return;
    const nextId = getNextSiblingId(tail.id);
    if (!nextId) return;
    const signal = sessionController.current?.signal;

    bingeLoadingRef.current = true;
    setAppending(true);
    setAppendError("");
    try {
      const next = await loadReaderChapter(progressTarget, nextId, signal);
      const root = streamRef.current[0];
      if (root && (next.mangaId !== root.mangaId || next.mangaTitle !== root.mangaTitle)) throw new Error("The title changed while loading the next chapter. Reopen the reader to continue.");
      setStreamChapters((prev) => prev.some((item) => item.id === nextId) ? prev : [...prev, next]);
      autoScrollEndTriggered.current = false;
    } catch (err) {
      if (signal?.aborted) return;
      console.error("Failed to append binge chapter:", err);
      setAppendError(err instanceof Error && !(err as Error & { response?: unknown }).response ? err.message : getErrorMessage(err));
    } finally {
      bingeLoadingRef.current = false;
      setAppending(false);
    }
  }, [streamChapters, getNextSiblingId, progressTarget]);

  // Commit immediately. Only network synchronization is debounced by the app shell.
  const saveProgress = useCallback((streamChapter: StreamChapter, pageIndex: number) => {
    if (!readyPagesRef.current.has(pageIdentity(streamChapter.id, pageIndex))) return;
    if (lastSavedPagesRef.current.get(streamChapter.id) === pageIndex) return;
    lastSavedPagesRef.current.set(streamChapter.id, pageIndex);

    const progress = createProgressSnapshot(streamChapter, streamChapter.mangaTitle, pageIndex);
    void updateProgress(progressTarget, progress);
  }, [updateProgress, pageIdentity, progressTarget]);

  const publishCursor = useCallback((cursor: ReaderCursor, ready: boolean) => {
    const owner = streamRef.current.find((item) => item.id === cursor.chapterId);
    if (!owner) return;
    const previous = cursorRef.current;
    cursorRef.current = cursor;
    if (previous.chapterId !== cursor.chapterId) setActiveChapterId(cursor.chapterId);
    if (previous.pageIndex !== cursor.pageIndex) setCurrentPage(cursor.pageIndex);
    const key = `${cursor.chapterId}:${cursor.pageIndex}`;
    if (lastWrittenCursor.current !== key || locationRef.current.state?.readerSession !== sessionToken) {
      lastWrittenCursor.current = key;
      navigate(`/reader/${cursor.chapterId}`, { replace: true, preventScrollReset: true, state: { readerSession: sessionToken, readerPage: cursor.pageIndex } });
    }
    if (ready) saveProgress(owner, cursor.pageIndex);
  }, [navigate, saveProgress, sessionToken]);
  const webtoon = useWebtoonNavigation(readerMode === "WEBTOON", publishCursor);

  useLayoutEffect(() => {
    if (initialized.current || !chapter || !rootPages.length) return;
    initialized.current = true;
    const root = readerChapter(chapter, rootPages);
    streamRef.current = [root];
    setStreamChapters([root]);
    setActiveChapterId(root.id); setCurrentPage(root.lastPageRead);
    cursorRef.current = { chapterId: root.id, pageIndex: root.lastPageRead };
    if (readerMode === "WEBTOON") webtoon.jump(root.id, root.lastPageRead);
    else publishCursor(cursorRef.current, false);
  }, [chapter, rootPages, readerMode, webtoon.jump, publishCursor]);

  const previousMode = useRef(readerMode);
  useLayoutEffect(() => {
    if (previousMode.current === readerMode) return;
    previousMode.current = readerMode;
    clearTimeout(transitionTimer.current); setIsTransitioning(false);
    const cursor = cursorRef.current;
    if (readerMode === "WEBTOON") webtoon.jump(cursor.chapterId, cursor.pageIndex);
    else webtoon.cancel();
  }, [readerMode, webtoon.jump, webtoon.cancel]);

  useEffect(() => {
    if (!initialized.current || location.state?.readerSession !== sessionToken) return;
    const id = Number(routeChapterId);
    const page = Number(location.state.readerPage ?? 0);
    if (!streamRef.current.some((item) => item.id === id)) return;
    if (cursorRef.current.chapterId === id && cursorRef.current.pageIndex === page) return;
    lastWrittenCursor.current = "";
    cursorRef.current = { chapterId: id, pageIndex: page }; setActiveChapterId(id); setCurrentPage(page);
    if (readerMode === "WEBTOON") webtoon.jump(id, page);
  }, [routeChapterId, location.key, location.state, readerMode, sessionToken, webtoon.jump]);
  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  const handlePageReady = useCallback((owner: StreamChapter, index: number, ready: boolean) => {
    const key = pageIdentity(owner.id, index);
    if (readyPagesRef.current.has(key) === ready) return;
    if (ready) readyPagesRef.current.add(key); else readyPagesRef.current.delete(key);
    setReadyPageVersion((value) => value + 1);
  }, [pageIdentity]);

  // Page Transitions Engine
  const changePageWithTransition = useCallback((nextIndex: number) => {
    if (readerMode === "WEBTOON" && activeChapter) { webtoon.jump(activeChapter.id, nextIndex); return; }
    clearTimeout(transitionTimer.current);
    if (pageTransition === "none") {
      setCurrentPage(nextIndex);
      if (activeChapter) publishCursor({ chapterId: activeChapter.id, pageIndex: nextIndex }, false);
      window.scrollTo(0, 0);
      return;
    }

    setIsTransitioning(true);
    transitionTimer.current = setTimeout(() => {
      setCurrentPage(nextIndex);
      if (activeChapter) publishCursor({ chapterId: activeChapter.id, pageIndex: nextIndex }, false);
      window.scrollTo(0, 0);
      setIsTransitioning(false);
    }, 150);
  }, [pageTransition, readerMode, activeChapter, webtoon.jump, publishCursor]);

  // Compute current spread indices A and B
  const { idxA, idxB } = useMemo(() => {
    if (readerMode === "WEBTOON" || pageSpread === "SINGLE") {
      return { idxA: currentPage, idxB: null };
    }
    if (pageSpread === "DOUBLE") {
      const idxA = currentPage % 2 === 0 ? currentPage : currentPage - 1;
      const idxB = idxA + 1;
      return { idxA, idxB };
    }
    // DOUBLE_COVER
    if (currentPage === 0) {
      return { idxA: 0, idxB: null };
    }
    const idxA = currentPage % 2 !== 0 ? currentPage : currentPage - 1;
    const idxB = idxA + 1;
    return { idxA, idxB };
  }, [currentPage, readerMode, pageSpread]);

  // Sync progress for single/spread modes
  useEffect(() => {
    if (readerMode === "WEBTOON" || pages.length === 0) return;
    const activePage = idxB !== null && idxB < pages.length ? idxB : idxA;
    const initialChapter = activeChapter;
    if (!initialChapter) return;
    const displayed = [idxA, idxB].filter((index): index is number => index !== null && index < pages.length);
    if (displayed.every((index) => readyPagesRef.current.has(pageIdentity(initialChapter.id, index)))) {
      saveProgress(initialChapter, activePage);
    }
  }, [idxA, idxB, readerMode, pages.length, saveProgress, activeChapter, readyPageVersion, pageIdentity]);

  // Navigation Logic
  const navigatePage = useCallback((dir: number) => {
    let next = currentPage + dir;
    
    if (readerMode !== "WEBTOON" && pageSpread !== "SINGLE") {
      if (dir === 1) {
        if (pageSpread === "DOUBLE_COVER" && currentPage === 0) {
          next = 1;
        } else {
          const startIdx = pageSpread === "DOUBLE"
            ? (currentPage % 2 === 0 ? currentPage : currentPage - 1)
            : (currentPage % 2 !== 0 ? currentPage : currentPage - 1);
          next = startIdx + 2;
        }
      } else if (dir === -1) {
        if (pageSpread === "DOUBLE_COVER") {
          if (currentPage <= 2) {
            next = 0;
          } else {
            const startIdx = currentPage % 2 !== 0 ? currentPage : currentPage - 1;
            next = startIdx - 2;
          }
        } else {
          const startIdx = currentPage % 2 === 0 ? currentPage : currentPage - 1;
          next = startIdx - 2;
        }
      }
    }

    if (next >= 0 && next < pages.length) {
      changePageWithTransition(next);
    } else if (next >= pages.length && nextChapterId) {
      navigate(`/reader/${nextChapterId}`);
    } else if (next < 0 && prevChapterId) {
      navigate(`/reader/${prevChapterId}`);
    }
  }, [currentPage, readerMode, pageSpread, pages.length, nextChapterId, prevChapterId, navigate, changePageWithTransition]);

  const handlePageClick = useCallback((e: React.MouseEvent) => {
    const width = window.innerWidth;
    const x = e.clientX;
    const threshold = width * (readerNavigationMode === "wide" ? 0.42 : 0.28);

    if (readerMode !== "WEBTOON") {
      e.stopPropagation();
      if (readerNavigationMode === "disabled") {
        setShowOverlay(!showOverlay);
      } else if (x < threshold) {
        const dir = readerMode === "RTL" ? 1 : -1;
        navigatePage(dir);
      } else if (x > width - threshold) {
        const dir = readerMode === "RTL" ? -1 : 1;
        navigatePage(dir);
      } else {
        setShowOverlay(!showOverlay);
      }
    } else {
      setShowOverlay(!showOverlay);
    }
  }, [navigatePage, readerMode, readerNavigationMode, showOverlay]);

  const handleJumpToPage = useCallback((pageIndex: number) => {
    const target = Math.min(Math.max(0, pageIndex), pages.length - 1);
    changePageWithTransition(target);
  }, [pages.length, changePageWithTransition]);

  // Preload next 3 images dynamically
  useEffect(() => {
    if (pages.length === 0 || !activeChapter || !serverBaseUrl) return;

    const preloadedImages: HTMLImageElement[] = [];
    const preloadCount = 3;

    for (let j = 1; j <= preloadCount; j++) {
      const nextIdx = currentPage + j;
      if (nextIdx < pages.length) {
        const preloadUrl = mockMode
          ? resolveBackendUrl(serverBaseUrl, pages[nextIdx])
          : buildSuwayomiPageUrl({
              serverBaseUrl,
              mangaId: activeChapter.mangaId,
              chapterSourceOrder: activeChapter.sourceOrder,
              pageIndex: nextIdx,
            });

        const img = new Image();
        img.src = preloadUrl;
        preloadedImages.push(img);
      }
    }

    return () => {
      preloadedImages.forEach((img) => {
        img.src = "";
      });
    };
  }, [currentPage, pages, activeChapter, mockMode, serverBaseUrl]);

  // Webtoon infinite-scroll binge (append chapters or navigate)
  useEffect(() => {
    if (readerMode !== "WEBTOON") return;
    const tail = streamChapters[streamChapters.length - 1];
    const nextId = tail ? getNextSiblingId(tail.id) : undefined;
    if (!nextId || webtoon.target) return;

    if (infiniteChapterReading) {
      if (!tailAnchor.current || appendError) return;
      const observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !bingeLoadingRef.current) void appendNextBingeChapter();
      }, { rootMargin: "0px 0px 800px 0px", threshold: 0 });
      observer.observe(tailAnchor.current);
      return () => observer.disconnect();
    }

    let nextTimer: ReturnType<typeof setTimeout> | undefined;
    const handleWebtoonScroll = () => {
      const isNearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
      if (!isNearBottom || autoScrollEndTriggered.current) return;

      autoScrollEndTriggered.current = true;
      setIsAutoScrolling(false);

      nextTimer = setTimeout(() => { if (isCurrentProgressBackend(progressTarget)) navigate(`/reader/${nextId}`); }, 800);
    };

    window.addEventListener("scroll", handleWebtoonScroll, { passive: true });
    return () => { window.removeEventListener("scroll", handleWebtoonScroll); clearTimeout(nextTimer); };
  }, [
    readerMode,
    navigate,
    infiniteChapterReading,
    appendNextBingeChapter,
    streamChapters,
    getNextSiblingId,
    appendError,
    webtoon.target,
    progressTarget,
  ]);

  // Auto-scroll loop
  useEffect(() => {
    if (!isAutoScrolling) {
      if (scrollRef.current) {
        cancelAnimationFrame(scrollRef.current);
        scrollRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    
    const scrollLoop = (time: number) => {
      const elapsed = time - lastTime;
      lastTime = time;
      
      const step = (autoScrollSpeed * elapsed) / 16; // Adjust speed denominator for frame pacing
      window.scrollBy(0, step);

      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 5;
      if (scrolledToBottom) {
        setIsAutoScrolling(false);
      } else {
        scrollRef.current = requestAnimationFrame(scrollLoop);
      }
    };

    scrollRef.current = requestAnimationFrame(scrollLoop);

    return () => {
      if (scrollRef.current) {
        cancelAnimationFrame(scrollRef.current);
      }
    };
  }, [isAutoScrolling, autoScrollSpeed]);

  // Pause scroll on user manual actions
  useEffect(() => {
    if (!isAutoScrolling) return;

    const stopScroll = () => {
      setIsAutoScrolling(false);
    };

    window.addEventListener("wheel", stopScroll, { passive: true });
    window.addEventListener("touchstart", stopScroll, { passive: true });
    window.addEventListener("mousedown", stopScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", stopScroll);
      window.removeEventListener("touchstart", stopScroll);
      window.removeEventListener("mousedown", stopScroll);
    };
  }, [isAutoScrolling]);

  // Keyboard binding listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]'))) {
        return;
      }

      const key = e.key.toLowerCase();
      if ((key === "enter" || key === " ") && e.target instanceof Element && e.target.closest("button, a")) return;

      const isNext = customKeybinds?.nextPage?.includes(key);
      const isPrev = customKeybinds?.prevPage?.includes(key);
      const isExit = customKeybinds?.toggleOverlay?.includes(key) || key === "escape";
      const isCycleFit = customKeybinds?.cycleFit?.includes(key);
      const isCycleSpread = customKeybinds?.cycleSpread?.includes(key);

      if (isNext) {
        e.preventDefault();
        const dir = readerMode === "RTL" ? -1 : 1;
        navigatePage(dir);
      } else if (isPrev) {
        e.preventDefault();
        const dir = readerMode === "RTL" ? 1 : -1;
        navigatePage(dir);
      } else if (isExit) {
        e.preventDefault();
        if (showOverlay) {
          navigate(activeChapter?.mangaId ? `/manga/${activeChapter.mangaId}` : "/library");
        } else {
          setShowOverlay(true);
        }
      } else if (isCycleFit) {
        e.preventDefault();
        const modes: FitMode[] = ["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"];
        const nextIdx = (modes.indexOf(fitMode) + 1) % modes.length;
        handleFitModeChange(modes[nextIdx]);
      } else if (isCycleSpread) {
        e.preventDefault();
        if (readerMode !== "WEBTOON") {
          const spreads: PageSpread[] = ["SINGLE", "DOUBLE", "DOUBLE_COVER"];
          const nextIdx = (spreads.indexOf(pageSpread) + 1) % spreads.length;
          handlePageSpreadChange(spreads[nextIdx]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentPage, 
    readerMode, 
    fitMode, 
    pageSpread, 
    pages.length, 
    navigatePage, 
    navigate, 
    activeChapter?.mangaId,
    handleFitModeChange, 
    handlePageSpreadChange, 
    customKeybinds, 
    showOverlay
  ]);

  if (!serverBaseUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-slate-300">
        <p className="text-lg font-semibold">No Suwayomi server configured.</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
          Connect Yomikura to your Suwayomi server before opening reader routes.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={() => navigate("/")} className="rounded-md bg-yomi-jade px-4 py-2 text-sm font-semibold text-ink-950">
            Connect server
          </button>
          <button onClick={() => navigate("/settings")} className="rounded-md border border-white/10 px-4 py-2 text-sm text-yomi-jade">
            Settings
          </button>
        </div>
      </div>
    );
  }

  if (!activeChapter && (chapterLoading || pagesLoading || !!rootPages.length)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <span className="mt-4 text-sm text-slate-400">Loading chapter...</span>
      </div>
    );
  }

  if (!activeChapter && (chapterError || pagesError || !chapter)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-slate-300">
        <SourceRecoveryPanel
          problem={pageProblem}
          title={pageProblem?.title || "Failed to load pages."}
          detail={pageProblem?.detail || "The chapter metadata or page list could not be loaded."}
          onRetry={retryReaderLoad}
          retryLabel="Retry reader"
          className="bg-ink-950/90"
        />
      </div>
    );
  }

  if (!activeChapter || pages.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-slate-300">
        <SourceRecoveryPanel
          title="No pages returned."
          detail="Suwayomi returned the chapter, but the source did not provide any page URLs. Try another source for this title."
          searchedTitle={chapter?.manga?.title || null}
          onRetry={retryReaderLoad}
          retryLabel="Retry pages"
          className="bg-ink-950/90"
        />
      </div>
    );
  }

  const showB = idxB !== null && idxB < pages.length;
  const pageIndices = showB
    ? (readerMode === "RTL" ? [idxB, idxA] : [idxA, idxB])
    : [idxA];

  const buildPageUrl = (pageIndex: number) => {
    if (mockMode) return resolveBackendUrl(serverBaseUrl, pages[pageIndex]);
    return buildSuwayomiPageUrl({
      serverBaseUrl,
      mangaId: activeChapter.mangaId,
      chapterSourceOrder: activeChapter.sourceOrder,
      pageIndex,
    });
  };

  // Determine transition animations
  let transitionClass = "transition-[opacity,transform] duration-150";
  if (isTransitioning) {
    if (pageTransition === "fade") transitionClass += " opacity-0";
    else if (pageTransition === "slide") transitionClass += " transform translate-x-8 opacity-0";
  } else {
    if (pageTransition === "fade") transitionClass += " opacity-100";
    else if (pageTransition === "slide") transitionClass += " transform translate-x-0 opacity-100";
  }

  return (
    <div className="min-h-screen bg-black">
      {progressSaveError && <div role="alert" className="fixed left-4 top-20 z-[60] max-w-md rounded-lg border border-red-400/30 bg-ink-950 p-3 text-sm text-slate-200">
        <p>{progressSaveError}</p>
        <button type="button" className="mt-2 text-yomi-jade underline" onClick={() => {
          const failed = failedProgressRef.current;
          if (failed) void updateProgress(failed.backend, failed.progress);
          else window.location.reload();
        }}>{failedProgressRef.current ? "Retry saving progress" : "Reopen chapter"}</button>
      </div>}
      <ReaderOverlay
        show={showOverlay}
        mangaId={activeChapter.mangaId}
        mangaTitle={activeChapter.mangaTitle}
        chapterName={activeChapter.name}
        currentPage={currentPage}
        totalPages={pages.length}
        readerMode={readerMode}
        onModeChange={handleReaderModeChange}
        fitMode={fitMode}
        onFitModeChange={handleFitModeChange}
        pageSpread={pageSpread}
        onPageSpreadChange={handlePageSpreadChange}
        imageFilters={effectiveImageFilters}
        onImageFiltersChange={(filters: Partial<ImageFilters>) => changeTitleSetting({ imageFilters: filters })}
        cropBorders={effectiveCropBorders}
        onCropBordersChange={(cropBorders) => changeTitleSetting({ cropBorders })}
        pageTransition={pageTransition}
        onPageTransitionChange={(pageTransition) => changeTitleSetting({ pageTransition })}
        autoDownloadCount={effectiveAutoDownloadCount}
        onAutoDownloadCountChange={(autoDownloadCount) => changeTitleSetting({ autoDownloadCount })}
        nextChapterId={nextChapterId}
        prevChapterId={prevChapterId}
        hasOverride={hasOverride}
        onToggleOverride={handleToggleOverride}
        buildPageUrl={buildPageUrl}
        onJumpToPage={handleJumpToPage}
        onHeaderRef={webtoon.onHeaderRef}
        isAutoScrolling={isAutoScrolling}
        onToggleAutoScroll={() => setIsAutoScrolling(!isAutoScrolling)}
      />

      {/* Pages Container */}
      <div 
        className={`w-full mx-auto max-w-4xl cursor-pointer ${
          readerMode === "WEBTOON" 
            ? "flex flex-col" 
            : fitMode === "FIT_WIDTH"
              ? "h-screen overflow-y-auto flex justify-center items-start"
              : "flex h-screen items-center justify-center overflow-hidden"
        } ${transitionClass}`}
        onClick={handlePageClick}
      >
        {readerMode === "WEBTOON" ? (
          <div className="flex flex-col w-full" style={{ paddingTop: webtoon.headerInset, paddingBottom: `calc(100vh - ${webtoon.headerInset}px)` }}>
            {streamChapters.map((streamCh, ci) => (
              <div key={streamCh.id} className="flex w-full flex-col">
                {ci > 0 && (
                  <div className="border-t border-white/5 bg-ink-950/80 py-2 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {streamCh.name}
                  </div>
                )}
                {streamCh.pages.map((url, i) => (
                  <WebtoonPage key={`${streamCh.id}-${i}`} chapterId={streamCh.id} pageIndex={i}
                    forceVisible={webtoon.target?.chapterId === streamCh.id && webtoon.target.pageIndex === i}
                    onAnchor={webtoon.onAnchor} onLayout={webtoon.onLayout}>
                    <ReaderImage
                      url={mockMode
                        ? resolveBackendUrl(serverBaseUrl, url)
                        : buildSuwayomiPageUrl({
                            serverBaseUrl,
                            mangaId: streamCh.mangaId,
                            chapterSourceOrder: streamCh.sourceOrder,
                            pageIndex: i,
                          })}
                      fallbackUrl={resolveBackendUrl(serverBaseUrl, url)}
                      pageNumber={i}
                      onReadyChange={(ready) => handlePageReady(streamCh, i, ready)}
                      onLoadStateChange={(state) => webtoon.onImageState(streamCh.id, i, state)}
                      imageFilters={effectiveImageFilters}
                      cropBorders={effectiveCropBorders}
                    />
                  </WebtoonPage>
                ))}
              </div>
            ))}
            <div ref={tailAnchor} aria-hidden="true" className="h-px" />
            {appending && <p role="status" className="p-5 text-center text-sm text-slate-400">Loading next chapter…</p>}
            {appendError && <div role="alert" className="space-y-3 border-t border-white/10 bg-ink-950 p-5 text-center text-sm text-slate-300">
              <p>{appendError}</p><button type="button" className="yomi-button yomi-button-secondary" onClick={(event) => { event.stopPropagation(); void appendNextBingeChapter(); }}>Retry next chapter</button>
            </div>}

            {!infiniteChapterReading && nextChapterId && (
              <div className="flex w-full flex-col items-center justify-center gap-3 border-t border-white/5 bg-ink-950 p-8 text-center">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {t("completed_chapter")}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/reader/${nextChapterId}`);
                  }}
                  className="rounded-xl border border-yomi-jade/20 bg-yomi-jade/10 px-6 py-3 text-sm font-semibold text-yomi-mint transition-[background-color,transform] duration-150 hover:bg-yomi-jade/20 active:scale-[.97]"
                >
                  {t("load_next_chapter")}
                </button>
              </div>
            )}
          </div>
        ) : (
          // Single/Double page mode
          <div className="flex w-full h-full items-center justify-center gap-1 md:gap-2">
            {pageIndices.map((idx) => {
              const isDouble = pageIndices.length > 1;
              return (
                <div 
                  key={idx} 
                  className={`${isDouble ? "w-1/2" : "w-full"} h-full flex items-center justify-center`}
                >
                  <ReaderImage
                    url={buildPageUrl(idx)}
                    fallbackUrl={resolveBackendUrl(serverBaseUrl, pages[idx])}
                    pageNumber={idx}
                    onReadyChange={(ready) => {
                      const owner = activeChapter;
                      if (owner) handlePageReady(owner, idx, ready);
                    }}
                    mode="single"
                    fitMode={fitMode}
                    imageFilters={effectiveImageFilters}
                    cropBorders={effectiveCropBorders}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
