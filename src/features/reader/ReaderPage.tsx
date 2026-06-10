import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSettingsStore, FitMode, PageSpread, ReaderMode } from "../../stores/useSettingsStore";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { classifySourceProblem } from "../../api/suwayomi/errors";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../../api/suwayomi/pageUrls";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { ReaderImage } from "./ReaderImage";
import { ReaderOverlay } from "./ReaderOverlay";
import { 
  getCachedChapter, 
  getCachedChaptersForManga, 
  updateCachedChapterProgress 
} from "../../api/suwayomi/offlineCache";

interface WebtoonPageWrapperProps {
  pageIndex: number;
  children: React.ReactNode;
}

function WebtoonPageWrapper({ pageIndex, children }: WebtoonPageWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number>(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: "1200px 0px",
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => {
      observer.unobserve(el);
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const h = entry.contentRect.height;
        if (h > 0) {
          setMeasuredHeight(h);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      style={{
        height: isVisible ? "auto" : `${measuredHeight}px`,
        contentVisibility: isVisible ? "visible" : "auto",
        containIntrinsicSize: `auto ${measuredHeight}px`,
      }}
      className="w-full bg-black relative min-h-[100px]"
    >
      {isVisible ? children : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="h-1 w-12 bg-white/10 rounded overflow-hidden">
            <div className="h-full bg-yomi-jade/30 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Settings store global values & setters
  const { 
    serverBaseUrl, 
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
    pageTransition,
    autoDownloadCount,
    customKeybinds,
    autoDeleteReadChapters
  } = useSettingsStore();

  const { downloadChapter, cachedChapters } = useDownloadStore();

  const [showOverlay, setShowOverlay] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const lastSavedPageRef = useRef<number | null>(null);
  const debouncedUpdateRef = useRef<any>(null);
  const scrollRef = useRef<number | null>(null);
  const autoScrollEndTriggered = useRef(false);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch chapter details
  const { data: chapterData, isLoading: chapterLoading, isError: chapterError, error: chapterErrorObject, refetch: refetchChapter } = useQuery({
    queryKey: ["chapter", chapterId, serverBaseUrl],
    queryFn: async () => {
      try {
        return await sdk.GetChapter({ id: parseInt(chapterId!) });
      } catch (err) {
        console.warn("Failed to fetch chapter from server, checking offline cache...", err);
        const cached = await getCachedChapter(serverBaseUrl, parseInt(chapterId!));
        if (cached) {
          const allCached = await getCachedChaptersForManga(serverBaseUrl, cached.mangaId);
          return {
            chapter: {
              id: cached.id,
              name: cached.name,
              chapterNumber: cached.chapterNumber,
              isRead: cached.isRead || false,
              lastPageRead: cached.lastPageRead ?? 0,
              pageCount: cached.pageCount,
              sourceOrder: cached.sourceOrder,
              mangaId: cached.mangaId,
              manga: {
                title: cached.mangaTitle,
                chapters: {
                  edges: allCached.map(c => ({
                    node: {
                      id: c.id,
                      chapterNumber: c.chapterNumber,
                    }
                  }))
                }
              }
            }
          };
        }
        throw err;
      }
    },
    enabled: !!serverBaseUrl && !!chapterId,
  });

  const chapter = chapterData?.chapter;
  const mangaId = chapter?.mangaId;

  // Resolve Overrides
  const hasOverride = mangaId !== undefined && mangaSettingsOverrides[mangaId] !== undefined;
  
  const readerMode = hasOverride && mangaSettingsOverrides[mangaId]?.readerMode ? mangaSettingsOverrides[mangaId].readerMode! : globalReaderMode;
  const fitMode = hasOverride && mangaSettingsOverrides[mangaId]?.fitMode ? mangaSettingsOverrides[mangaId].fitMode! : globalFitMode;
  const pageSpread = hasOverride && mangaSettingsOverrides[mangaId]?.pageSpread ? mangaSettingsOverrides[mangaId].pageSpread! : globalPageSpread;

  const handleReaderModeChange = useCallback((mode: ReaderMode) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { readerMode: mode });
    } else {
      setGlobalReaderMode(mode);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalReaderMode]);

  const handleFitModeChange = useCallback((mode: FitMode) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { fitMode: mode });
    } else {
      setGlobalFitMode(mode);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalFitMode]);

  const handlePageSpreadChange = useCallback((spread: PageSpread) => {
    if (mangaId !== undefined && hasOverride) {
      setMangaOverride(mangaId, { pageSpread: spread });
    } else {
      setGlobalPageSpread(spread);
    }
  }, [mangaId, hasOverride, setMangaOverride, setGlobalPageSpread]);

  const handleToggleOverride = useCallback(() => {
    if (mangaId === undefined) return;
    if (hasOverride) {
      clearMangaOverride(mangaId);
    } else {
      setMangaOverride(mangaId, {
        readerMode,
        fitMode,
        pageSpread
      });
    }
  }, [mangaId, hasOverride, clearMangaOverride, setMangaOverride, readerMode, fitMode, pageSpread]);

  // Fetch pages mutation
  const { mutate: fetchPages, data: pagesData, isPending: pagesLoading, isError: pagesError, error: pagesErrorObject } = useMutation({
    mutationFn: async () => {
      try {
        return await sdk.FetchChapterPages({ input: { chapterId: parseInt(chapterId!) } });
      } catch (err) {
        console.warn("Failed to fetch pages from server, checking offline cache...", err);
        const cached = await getCachedChapter(serverBaseUrl, parseInt(chapterId!));
        if (cached) {
          return {
            fetchChapterPages: {
              pages: cached.pages
            }
          };
        }
        throw err;
      }
    }
  });

  // Update progress mutation
  const { mutate: updateProgress } = useMutation({
    mutationFn: async (pageIndex: number) => {
      const isRead = pages && pageIndex >= pages.length - 1;

      try {
        await updateCachedChapterProgress(serverBaseUrl, parseInt(chapterId!), pageIndex, !!isRead);
      } catch (err) {
        console.error("Failed to update offline progress cache:", err);
      }

      try {
        const result = await sdk.UpdateChapterProgress({ 
          input: { 
            id: parseInt(chapterId!),
            patch: { 
              lastPageRead: pageIndex, 
              isRead 
            } 
          } 
        });

        if (isRead && autoDeleteReadChapters) {
          try {
            await sdk.DeleteDownloadedChapter({
              input: {
                id: parseInt(chapterId!)
              }
            });
          } catch (deleteErr) {
            console.error("Failed to auto-delete read downloaded chapter:", deleteErr);
          }
        }

        return result;
      } catch (err) {
        console.warn("Failed to update progress on server (saved locally):", err);
        return null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter"] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
    }
  });

  useEffect(() => {
    if (chapterId && serverBaseUrl) {
      setCurrentPage(0);
      lastSavedPageRef.current = null;
      setIsAutoScrolling(false);
      autoScrollEndTriggered.current = false;
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
      }
      fetchPages();
    }
  }, [chapterId, serverBaseUrl, fetchPages]);

  const pages = pagesData?.fetchChapterPages?.pages || [];
  const pageProblem = chapterError || pagesError ? classifySourceProblem(chapterErrorObject ?? pagesErrorObject) : null;

  const retryReaderLoad = useCallback(() => {
    void refetchChapter();
    fetchPages();
  }, [fetchPages, refetchChapter]);

  useEffect(() => {
    if (!chapter || pages.length === 0) return;
    const savedPage = Math.min(Math.max(chapter.lastPageRead || 0, 0), pages.length - 1);
    setCurrentPage(savedPage);
    lastSavedPageRef.current = savedPage;
  }, [chapter?.id, chapter?.lastPageRead, pages.length]);

  // Compute Sibling Chapters
  const siblingChapters = useMemo(() => {
    if (!chapter?.manga?.chapters?.edges) return [];
    return chapter.manga.chapters.edges
      .map(e => e?.node)
      .filter((n): n is NonNullable<typeof n> => n != null)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }, [chapter]);

  const { prevChapterId, nextChapterId } = useMemo(() => {
    if (!chapter || siblingChapters.length === 0) return {};
    const idx = siblingChapters.findIndex(c => c.id === chapter.id);
    return {
      prevChapterId: idx > 0 ? siblingChapters[idx - 1].id : undefined,
      nextChapterId: idx >= 0 && idx < siblingChapters.length - 1 ? siblingChapters[idx + 1].id : undefined,
    };
  }, [chapter, siblingChapters]);

  // Auto-Download Queue effect
  useEffect(() => {
    if (!chapter || autoDownloadCount <= 0 || siblingChapters.length === 0) return;

    const idx = siblingChapters.findIndex(c => c.id === chapter.id);
    if (idx === -1) return;

    const nextChapters = siblingChapters.slice(idx + 1, idx + 1 + autoDownloadCount);

    const triggerDownloads = async () => {
      for (const ch of nextChapters) {
        const isAlreadyDownloaded = cachedChapters?.some(cc => cc.id === ch.id);
        if (!isAlreadyDownloaded) {
          try {
            await downloadChapter(ch.id, chapter.manga?.title);
          } catch (err) {
            console.error("Failed background auto-download for chapter:", ch.id, err);
          }
        }
      }
    };

    void triggerDownloads();
  }, [chapter?.id, autoDownloadCount, siblingChapters, cachedChapters, downloadChapter]);

  // Debounced progress saver
  const saveProgress = useCallback((pageIndex: number) => {
    if (lastSavedPageRef.current === pageIndex) return;
    lastSavedPageRef.current = pageIndex;

    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
    }

    debouncedUpdateRef.current = setTimeout(() => {
      updateProgress(pageIndex);
    }, 1500);
  }, [updateProgress]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
      }
    };
  }, []);

  const handleIntersect = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    saveProgress(pageIndex);
  }, [saveProgress]);

  // Page Transitions Engine
  const changePageWithTransition = useCallback((nextIndex: number) => {
    if (pageTransition === "none") {
      setCurrentPage(nextIndex);
      window.scrollTo(0, 0);
      return;
    }

    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentPage(nextIndex);
      window.scrollTo(0, 0);
      setIsTransitioning(false);
    }, 150);
  }, [pageTransition]);

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
    saveProgress(activePage);
  }, [idxA, idxB, readerMode, pages.length, saveProgress]);

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
    const threshold = width * 0.3;

    if (readerMode !== "WEBTOON") {
      e.stopPropagation();
      if (x < threshold) {
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
  }, [navigatePage, readerMode, showOverlay]);

  const handleJumpToPage = useCallback((pageIndex: number) => {
    const target = Math.min(Math.max(0, pageIndex), pages.length - 1);
    changePageWithTransition(target);
  }, [pages.length, changePageWithTransition]);

  // Preload next 3 images dynamically
  useEffect(() => {
    if (pages.length === 0 || !chapter || !serverBaseUrl) return;

    const preloadedImages: HTMLImageElement[] = [];
    const preloadCount = 3;

    for (let j = 1; j <= preloadCount; j++) {
      const nextIdx = currentPage + j;
      if (nextIdx < pages.length) {
        const preloadUrl = buildSuwayomiPageUrl({
          serverBaseUrl,
          mangaId: chapter.mangaId,
          chapterSourceOrder: chapter.sourceOrder,
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
  }, [currentPage, pages, chapter, serverBaseUrl]);

  // Webtoon infinite-scroll binge effect (scroll to bottom auto-advance)
  useEffect(() => {
    if (readerMode !== "WEBTOON" || !nextChapterId) return;

    const handleWebtoonScroll = () => {
      const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
      if (isNearBottom && !autoScrollEndTriggered.current) {
        autoScrollEndTriggered.current = true;
        setIsAutoScrolling(false);
        // Load next chapter after 1.2s delay
        setTimeout(() => {
          navigate(`/reader/${nextChapterId}`);
        }, 1200);
      }
    };

    window.addEventListener("scroll", handleWebtoonScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleWebtoonScroll);
  }, [readerMode, nextChapterId, navigate]);

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      const isNext = customKeybinds?.nextPage?.includes(key);
      const isPrev = customKeybinds?.prevPage?.includes(key);
      const isExit = customKeybinds?.toggleOverlay?.includes(key) || key === "escape";
      const isCycleFit = customKeybinds?.cycleFit?.includes(key);
      const isCycleSpread = customKeybinds?.cycleSpread?.includes(key);

      if (isNext) {
        const dir = readerMode === "RTL" ? -1 : 1;
        navigatePage(dir);
      } else if (isPrev) {
        const dir = readerMode === "RTL" ? 1 : -1;
        navigatePage(dir);
      } else if (isExit) {
        if (showOverlay) {
          navigate(chapter?.mangaId ? `/manga/${chapter.mangaId}` : "/library");
        } else {
          setShowOverlay(true);
        }
      } else if (isCycleFit) {
        const modes: FitMode[] = ["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"];
        const nextIdx = (modes.indexOf(fitMode) + 1) % modes.length;
        handleFitModeChange(modes[nextIdx]);
      } else if (isCycleSpread) {
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
    chapter?.mangaId, 
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

  if (chapterLoading || pagesLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <span className="mt-4 text-sm text-slate-400">Loading chapter...</span>
      </div>
    );
  }

  if (chapterError || pagesError || !chapter) {
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

  if (pages.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 py-10 text-slate-300">
        <SourceRecoveryPanel
          title="No pages returned."
          detail="Suwayomi returned the chapter, but the source did not provide any page URLs. Try another source for this title."
          searchedTitle={chapter.manga?.title || null}
          onRetry={() => fetchPages()}
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
    return buildSuwayomiPageUrl({
      serverBaseUrl,
      mangaId: chapter.mangaId,
      chapterSourceOrder: chapter.sourceOrder,
      pageIndex,
    });
  };

  // Determine transition animations
  let transitionClass = "transition-all duration-150";
  if (isTransitioning) {
    if (pageTransition === "fade") transitionClass += " opacity-0";
    else if (pageTransition === "slide") transitionClass += " transform translate-x-8 opacity-0";
  } else {
    if (pageTransition === "fade") transitionClass += " opacity-100";
    else if (pageTransition === "slide") transitionClass += " transform translate-x-0 opacity-100";
  }

  return (
    <div className="min-h-screen bg-black">
      <ReaderOverlay
        show={showOverlay}
        mangaId={chapter.mangaId}
        mangaTitle={chapter.manga?.title || "Unknown Manga"}
        chapterName={chapter.name}
        currentPage={currentPage}
        totalPages={pages.length}
        readerMode={readerMode}
        onModeChange={handleReaderModeChange}
        fitMode={fitMode}
        onFitModeChange={handleFitModeChange}
        pageSpread={pageSpread}
        onPageSpreadChange={handlePageSpreadChange}
        nextChapterId={nextChapterId}
        prevChapterId={prevChapterId}
        hasOverride={hasOverride}
        onToggleOverride={handleToggleOverride}
        buildPageUrl={buildPageUrl}
        onJumpToPage={handleJumpToPage}
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
          // Webtoon mode
          <div className="flex flex-col w-full">
            {pages.map((url, i) => (
              <WebtoonPageWrapper key={i} pageIndex={i}>
                <ReaderImage
                  url={buildPageUrl(i)}
                  fallbackUrl={resolveBackendUrl(serverBaseUrl, url)}
                  pageNumber={i}
                  onIntersect={handleIntersect}
                />
              </WebtoonPageWrapper>
            ))}
            
            {/* Inline Up Next Chapter bar for binge scrolling */}
            {nextChapterId && (
              <div className="w-full bg-ink-950 p-8 text-center border-t border-white/5 flex flex-col items-center justify-center gap-3">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Completed Chapter</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/reader/${nextChapterId}`);
                  }}
                  className="rounded-xl bg-yomi-jade/10 border border-yomi-jade/20 hover:bg-yomi-jade/20 text-yomi-mint px-6 py-3 text-sm font-semibold transition-all duration-300"
                >
                  Load Next Chapter
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
                    mode="single"
                    fitMode={fitMode}
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
