import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { ReaderImage } from "./ReaderImage";
import { ReaderOverlay } from "./ReaderOverlay";

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { serverBaseUrl, readerMode, setReaderMode } = useSettingsStore();
  const [showOverlay, setShowOverlay] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch chapter details
  const { data: chapterData, isLoading: chapterLoading } = useQuery({
    queryKey: ["chapter", chapterId, serverBaseUrl],
    queryFn: () => sdk.GetChapter({ id: parseInt(chapterId!) }),
    enabled: !!serverBaseUrl && !!chapterId,
  });

  // Fetch pages mutation
  const { mutate: fetchPages, data: pagesData, isPending: pagesLoading, isError: pagesError } = useMutation({
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
      fetchPages();
    }
  }, [chapterId, serverBaseUrl, fetchPages]);

  const chapter = chapterData?.chapter;
  const pages = pagesData?.fetchChapterPages?.pages || [];

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

  const handleIntersect = (pageIndex: number) => {
    setCurrentPage(pageIndex);
    updateProgress(pageIndex);
  };

  const handlePageClick = (e: React.MouseEvent) => {
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
  };

  const navigatePage = (dir: number) => {
    const next = currentPage + dir;
    if (next >= 0 && next < pages.length) {
      setCurrentPage(next);
      updateProgress(next);
      window.scrollTo(0, 0); // Reset scroll for single page mode
    } else if (next >= pages.length && nextChapterId) {
      navigate(`/reader/${nextChapterId}`);
    } else if (next < 0 && prevChapterId) {
      navigate(`/reader/${prevChapterId}`);
    }
  };

  if (chapterLoading || pagesLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <span className="mt-4 text-sm text-slate-400">Loading chapter...</span>
      </div>
    );
  }

  if (pagesError || !chapter) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-slate-300">
        <p>Failed to load pages.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-yomi-jade hover:underline">
          Go Back
        </button>
      </div>
    );
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
        onModeChange={setReaderMode}
        nextChapterId={nextChapterId}
        prevChapterId={prevChapterId}
      />

      {/* Pages Container */}
      <div 
        className={`w-full mx-auto max-w-4xl cursor-pointer ${readerMode === "WEBTOON" ? "flex flex-col" : "flex h-screen items-center justify-center overflow-hidden"}`}
        onClick={handlePageClick}
      >
        {readerMode === "WEBTOON" ? (
          // Webtoon mode: list all images vertically
          pages.map((url, i) => (
            <ReaderImage
              key={i}
              url={url}
              pageNumber={i}
              serverBaseUrl={serverBaseUrl}
              onIntersect={handleIntersect}
            />
          ))
        ) : (
          // Single page mode: show only current page
          pages.length > 0 && (
            <img 
              src={pages[currentPage].startsWith("http") ? pages[currentPage] : `${serverBaseUrl.replace(/\/$/, "")}${pages[currentPage].startsWith("/") ? "" : "/"}${pages[currentPage]}`} 
              className="max-h-full max-w-full object-contain" 
              alt={`Page ${currentPage + 1}`} 
            />
          )
        )}
      </div>
    </div>
  );
}
