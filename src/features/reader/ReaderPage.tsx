import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSettingsStore, FitMode, PageSpread } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { classifySourceProblem } from "../../api/suwayomi/errors";
import { buildSuwayomiPageUrl, resolveBackendUrl } from "../../api/suwayomi/pageUrls";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { ReaderImage } from "./ReaderImage";
import { ReaderOverlay } from "./ReaderOverlay";

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Settings store options
  const { 
    serverBaseUrl, 
    readerMode, 
    setReaderMode, 
    fitMode, 
    setFitMode, 
    pageSpread, 
    setPageSpread 
  } = useSettingsStore();

  const [showOverlay, setShowOverlay] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const lastSavedPageRef = useRef<number | null>(null);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch chapter details
  const { data: chapterData, isLoading: chapterLoading, isError: chapterError, error: chapterErrorObject, refetch: refetchChapter } = useQuery({
    queryKey: ["chapter", chapterId, serverBaseUrl],
    queryFn: () => sdk.GetChapter({ id: parseInt(chapterId!) }),
    enabled: !!serverBaseUrl && !!chapterId,
  });

  // Fetch pages mutation
  const { mutate: fetchPages, data: pagesData, isPending: pagesLoading, isError: pagesError, error: pagesErrorObject } = useMutation({
    mutationFn: () => sdk.FetchChapterPages({ input: { chapterId: parseInt(chapterId!) } }),
  });

  // Update progress mutation
  const { mutate: updateProgress } = useMutation({
    mutationFn: (pageIndex: number) => 
      sdk.UpdateChapterProgress({ 
        input: { 
          id: parseInt(chapterId!),
          patch: { 
            lastPageRead: pageIndex, 
            isRead: pages && pageIndex >= pages.length - 1 
          } 
        } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapter"] });
      queryClient.invalidateQueries({ queryKey: ["manga"] });
    }
  });

  useEffect(() => {
    if (chapterId && serverBaseUrl) {
      setCurrentPage(0);
      lastSavedPageRef.current = null;
      fetchPages();
    }
  }, [chapterId, serverBaseUrl, fetchPages]);

  const chapter = chapterData?.chapter;
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

  // Compute Next/Prev chapters
  const siblingChapters = useMemo(() => {
    if (!chapter?.manga?.chapters?.edges) return [];
    return chapter.manga.chapters.edges
      .map(e => e?.node)
      .filter((n): n is NonNullable<typeof n> => n != null)
      .sort((a, b) => a.chapterNumber - b.chapterNumber); // Ascending order
  }, [chapter]);

  const { prevChapterId, nextChapterId } = useMemo(() => {
    if (!chapter || siblingChapters.length === 0) return {};
    const idx = siblingChapters.findIndex(c => c.id === chapter.id);
    return {
      prevChapterId: idx > 0 ? siblingChapters[idx - 1].id : undefined,
      nextChapterId: idx >= 0 && idx < siblingChapters.length - 1 ? siblingChapters[idx + 1].id : undefined,
    };
  }, [chapter, siblingChapters]);

  const saveProgress = useCallback((pageIndex: number) => {
    if (lastSavedPageRef.current === pageIndex) return;
    lastSavedPageRef.current = pageIndex;
    updateProgress(pageIndex);
  }, [updateProgress]);

  const handleIntersect = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    saveProgress(pageIndex);
  }, [saveProgress]);

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

  // Sync progress for single/spread modes based on pages currently showing
  useEffect(() => {
    if (readerMode === "WEBTOON" || pages.length === 0) return;
    const activePage = idxB !== null && idxB < pages.length ? idxB : idxA;
    saveProgress(activePage);
  }, [idxA, idxB, readerMode, pages.length, saveProgress]);

  const navigatePage = useCallback((dir: number) => {
    let next = currentPage + dir;
    
    // Custom double-page navigation jumps
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
      setCurrentPage(next);
      window.scrollTo(0, 0); // Reset scroll for single page mode
    } else if (next >= pages.length && nextChapterId) {
      navigate(`/reader/${nextChapterId}`);
    } else if (next < 0 && prevChapterId) {
      navigate(`/reader/${prevChapterId}`);
    }
  }, [currentPage, readerMode, pageSpread, pages.length, nextChapterId, prevChapterId, navigate]);

  const handlePageClick = useCallback((e: React.MouseEvent) => {
    const width = window.innerWidth;
    const x = e.clientX;
    const threshold = width * 0.3; // 30% edge tap zones

    if (readerMode !== "WEBTOON") {
      e.stopPropagation();
      if (x < threshold) {
        // Left tap
        const dir = readerMode === "LTR" ? -1 : 1;
        navigatePage(dir);
      } else if (x > width - threshold) {
        // Right tap
        const dir = readerMode === "LTR" ? 1 : -1;
        navigatePage(dir);
      } else {
        setShowOverlay(!showOverlay);
      }
    } else {
      setShowOverlay(!showOverlay);
    }
  }, [navigatePage, readerMode, showOverlay]);

  // Keyboard binding listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "arrowright" || key === " ") {
        // RTL-aware next page flip
        const dir = readerMode === "RTL" ? -1 : 1;
        navigatePage(dir);
      } else if (key === "arrowleft" || key === "backspace") {
        // RTL-aware prev page flip
        const dir = readerMode === "RTL" ? 1 : -1;
        navigatePage(dir);
      } else if (e.key === "Escape") {
        navigate(chapter?.mangaId ? `/manga/${chapter.mangaId}` : "/library");
      } else if (key === "w") {
        // Cycle Fit Modes: Screen -> Width -> Height
        const modes: FitMode[] = ["FIT_SCREEN", "FIT_WIDTH", "FIT_HEIGHT"];
        const nextIdx = (modes.indexOf(fitMode) + 1) % modes.length;
        setFitMode(modes[nextIdx]);
      } else if (key === "s") {
        // Cycle Page Spreads: Single -> Double -> Double + Cover
        if (readerMode !== "WEBTOON") {
          const spreads: PageSpread[] = ["SINGLE", "DOUBLE", "DOUBLE_COVER"];
          const nextIdx = (spreads.indexOf(pageSpread) + 1) % spreads.length;
          setPageSpread(spreads[nextIdx]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, readerMode, fitMode, pageSpread, pages.length, navigatePage, navigate, chapter?.mangaId, setFitMode, setPageSpread]);

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
        onModeChange={setReaderMode}
        fitMode={fitMode}
        onFitModeChange={setFitMode}
        pageSpread={pageSpread}
        onPageSpreadChange={setPageSpread}
        nextChapterId={nextChapterId}
        prevChapterId={prevChapterId}
      />

      {/* Pages Container */}
      <div 
        className={`w-full mx-auto max-w-4xl cursor-pointer ${
          readerMode === "WEBTOON" 
            ? "flex flex-col" 
            : fitMode === "FIT_WIDTH"
              ? "h-screen overflow-y-auto flex justify-center items-start"
              : "flex h-screen items-center justify-center overflow-hidden"
        }`}
        onClick={handlePageClick}
      >
        {readerMode === "WEBTOON" ? (
          // Webtoon mode: list all images vertically
          pages.map((url, i) => (
            <ReaderImage
              key={i}
              url={buildSuwayomiPageUrl({
                serverBaseUrl,
                mangaId: chapter.mangaId,
                chapterSourceOrder: chapter.sourceOrder,
                pageIndex: i,
              })}
              fallbackUrl={resolveBackendUrl(serverBaseUrl, url)}
              pageNumber={i}
              onIntersect={handleIntersect}
            />
          ))
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
                    url={buildSuwayomiPageUrl({
                      serverBaseUrl,
                      mangaId: chapter.mangaId,
                      chapterSourceOrder: chapter.sourceOrder,
                      pageIndex: idx,
                    })}
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
