import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LibraryGraphqlTransport, gql } from "../../api/graphql/transport";
import { ArrowLeft, Copy, ExternalLink, Loader2, Play, RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { applyCoverAccentFromImage, useCoverAccentEnabled } from "../../hooks/useCoverAccent";
import { createGraphqlClient } from "../../api/graphql/client";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { ChapterList, Chapter } from "./ChapterList";
import { MangaCategoryModal } from "./MangaCategoryModal";
import { TrackerPanel } from "./TrackerPanel";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { SourceMigrationModal } from "../../components/source/SourceMigrationModal";
import { normalizeChapterPolicy, readingPolicy, resumeChapter, selectChapters } from "./chapterPolicy";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { mangaReaderSettingsKey } from "../../stores/mangaReaderSettings";
import { getProgressHeads } from "../../api/suwayomi/progressStorage";
import { BookNotes } from "./BookNotes";
import { safeSourceUrl } from "./bookActions";
import { useFeedback } from "../../components/ui/FeedbackProvider";


const FETCH_CHAPTERS_DOCUMENT = gql`
  mutation FetchChapters($input: FetchChaptersInput!) {
    fetchChapters(input: $input) {
      chapters {
        id
        name
        chapterNumber
        sourceOrder
        isRead
        isBookmarked
        isDownloaded
        uploadDate
        scanlator
        lastPageRead
        pageCount
      }
    }
  }
`;

type ChapterNode = {
  id: number;
  name: string;
  chapterNumber: number;
  sourceOrder?: number;
  isRead: boolean;
  isBookmarked: boolean;
  isDownloaded: boolean;
  uploadDate: string | number;
  scanlator?: string | null;
  lastPageRead?: number;
  pageCount?: number;
};

type FetchChaptersResponse = {
  fetchChapters?: {
    chapters: ChapterNode[];
  } | null;
};

export default function MangaDetailPage() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const { serverBaseUrl, mockMode, chapterPolicies, experience } = useSettingsStore();
  const coverAccentEnabled = useCoverAccentEnabled();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);
  const { notify } = useFeedback();
  const [synopsisOpen, setSynopsisOpen] = useState(false), [stickyResume, setStickyResume] = useState(false), [refreshing, setRefreshing] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { loadCachedChapters, cachedChapters, cachedChapterIds } = useDownloadStore();

  useEffect(() => {
    void loadCachedChapters();
  }, [loadCachedChapters]);

  const graphqlEndpoint = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return cleanUrl ? `${cleanUrl}/api/graphql` : "";
  }, [serverBaseUrl]);

  const sdk = useMemo(() => {
    return createGraphqlClient(graphqlEndpoint, undefined, mockMode ? "demo" : "live");
  }, [graphqlEndpoint, mockMode]);

  const queryClient = useQueryClient();
  const policyBackend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const localProgress = useQuery({ queryKey: ["progress-local", policyBackend.key], queryFn: () => getProgressHeads(policyBackend), retry: false });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["manga", mangaId, serverBaseUrl, mockMode],
    retry: (attempt) => !cachedChapters.some((chapter) => String(chapter.mangaId) === mangaId) && attempt < 2,
    queryFn: () => sdk.GetMangaDetails({ id: parseInt(mangaId!) }),
    enabled: !!serverBaseUrl && !!mangaId,
  });

  const { isFetching: loadingDetails, isError: detailsFailed, refetch: retryDetails } = useQuery({
    queryKey: ["manga-initialization", mangaId, serverBaseUrl],
    enabled: !mockMode && !isError && data?.manga?.initialized === false,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const id = Number(mangaId);
      await sdk.FetchMangaDetails({ input: { id } }, undefined, signal);
      const refreshed = await sdk.GetMangaDetails({ id }, undefined, signal);
      if (!refreshed.manga.initialized) throw new Error("Book details are not available yet.");
      // This key belongs to the backend that started the request, even if the
      // reader switches profiles before the source responds.
      queryClient.setQueryData(["manga", mangaId, serverBaseUrl, false], refreshed);
      return refreshed;
    },
  });

  const parsedMangaId = useMemo(() => (mangaId ? parseInt(mangaId) : NaN), [mangaId]);

  const offlineChapters = useMemo(() => {
    if (isNaN(parsedMangaId)) return [];
    return cachedChapters.filter((ch) => ch.mangaId === parsedMangaId);
  }, [cachedChapters, parsedMangaId]);

  const isOfflineMode = (isError || !data?.manga) && offlineChapters.length > 0;

  const manga = useMemo(() => {
    if (isOfflineMode) {
      const firstCached = offlineChapters[0];
      return {
        id: parsedMangaId,
        title: firstCached?.mangaTitle || "Offline Manga",
        thumbnailUrl: null,
        inLibrary: false,
        author: null,
        artist: null,
        status: "UNKNOWN",
        source: { name: "Saved on this device" },
        genre: [],
        description: "Viewing in offline mode. Only cached chapters are available.",
        categories: { nodes: [] },
        chapters: { nodes: [] },
      };
    }
    return data?.manga;
  }, [data?.manga, isOfflineMode, offlineChapters, parsedMangaId]);

  const { data: fetchedChaptersData, isLoading: chaptersLoading } = useQuery({
    queryKey: ["manga-chapters", mangaId, serverBaseUrl, mockMode],
    queryFn: async ({ signal }) => {
      if (mockMode) {
        return { fetchChapters: null };
      }
      const client = new LibraryGraphqlTransport(graphqlEndpoint, { signal });
      return client.request<FetchChaptersResponse>(FETCH_CHAPTERS_DOCUMENT, {
        input: { mangaId: parseInt(mangaId!) },
      });
    },
    enabled: !!graphqlEndpoint && !!mangaId && !!manga && !isOfflineMode && !mockMode,
    staleTime: 60_000,
  });

  const { mutate: toggleLibrary, isPending: togglingLibrary } = useMutation({
    mutationFn: () => sdk.ToggleMangaLibrary({
      input: {
        patch: {
          inLibrary: !manga?.inLibrary
        },
        id: parseInt(mangaId!)
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga"] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    }
  });

  const currentCategoryIds = useMemo(() => {
    if (!manga?.categories?.nodes) return [];
    return manga.categories.nodes
      .map((node) => node.id)
      .filter((id): id is number => id != null)
      .map(id => parseInt(String(id)));
  }, [manga]);

  const chapters: Chapter[] = useMemo(() => {
    if (isOfflineMode) {
      return offlineChapters.map((c) => ({
        id: c.id,
        name: c.name,
        chapterNumber: c.chapterNumber,
        sourceOrder: c.sourceOrder,
        isRead: !!c.isRead,
        isBookmarked: c.isBookmarked ?? false,
        isDownloaded: false,
        uploadDate: String(c.uploadDate ?? ""),
        scanlator: c.scanlator ?? null,
        lastPageRead: c.lastPageRead, pageCount: c.pageCount,
      }));
    }

    const fetchedChapters = fetchedChaptersData?.fetchChapters?.chapters ?? [];
    const cachedChaptersFromManga = manga?.chapters?.nodes
      ?.filter((node): node is NonNullable<typeof node> => node != null) ?? [];

    const sourceChapters = fetchedChapters.length > 0 ? fetchedChapters : cachedChaptersFromManga;

    return sourceChapters
      .map((c) => ({
        id: c.id,
        name: c.name,
        chapterNumber: c.chapterNumber,
        sourceOrder: c.sourceOrder,
        isRead: c.isRead,
        isBookmarked: c.isBookmarked,
        isDownloaded: c.isDownloaded,
        uploadDate: String(c.uploadDate),
        scanlator: c.scanlator,
        lastPageRead: c.lastPageRead, pageCount: c.pageCount,
      }));
  }, [fetchedChaptersData, manga, isOfflineMode, offlineChapters]);

  const isChaptersLoading = isOfflineMode ? false : chaptersLoading;

  // Find the first unread chapter to resume reading
  const continuation = useMemo(() => {
    const policy = normalizeChapterPolicy(chapterPolicies[mangaReaderSettingsKey(progressBackend(serverBaseUrl, mockMode), mangaId!)]);
    if (experience.downloadedOnly) policy.filter = "downloaded";
    const projected = chapters.map((chapter) => {
      const head = localProgress.data?.find((head) => head.chapter.chapterId === Number(chapter.id) && head.chapter.mangaId === Number(mangaId) && head.chapter.chapterName === chapter.name && head.chapter.mangaTitle === manga?.title);
      return head && head.dirtyFields?.includes("isRead") && (isOfflineMode || mockMode || head.sequence > head.acknowledgedSequence) ? { ...chapter, isRead: head.patch.isRead } : chapter;
    });
    return { unread: resumeChapter(projected, policy, cachedChapterIds), first: selectChapters(projected, readingPolicy(policy), cachedChapterIds)[0] };
  }, [chapters, chapterPolicies, serverBaseUrl, mockMode, mangaId, cachedChapterIds, localProgress.data, manga?.title, isOfflineMode, experience.downloadedOnly]);
  const firstUnreadChapter = continuation.unread;

  const imageUrl = useMemo(() => {
    if (!manga?.thumbnailUrl) return "/placeholder-cover.svg";
    return manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`;
  }, [manga?.thumbnailUrl, serverBaseUrl]);

  useEffect(() => {
    return applyCoverAccentFromImage(imageUrl, coverAccentEnabled);
  }, [imageUrl, coverAccentEnabled]);
  useEffect(() => { setSynopsisOpen(false); setStickyResume(false); }, [mangaId, policyBackend.key]);
  useEffect(() => {
    const node = actionsRef.current; if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStickyResume(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 60)), { rootMargin: "-60px 0px 0px 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, [manga?.id, isLoading, isOfflineMode]);
  const sourceUrl = safeSourceUrl(data?.manga?.realUrl);
  const refreshBook = async () => {
    setRefreshing(true);
    try { await sdk.RefreshMigrationTarget({ input: { id: parsedMangaId, fetchManga: true, fetchChapters: true } }); await Promise.all([queryClient.invalidateQueries({ queryKey: ["manga", mangaId, serverBaseUrl, mockMode] }), queryClient.invalidateQueries({ queryKey: ["manga-chapters", mangaId, serverBaseUrl, mockMode] }), queryClient.invalidateQueries({ queryKey: ["library"] })]); notify("Book details and chapters refreshed.", "success"); }
    catch { notify("The source couldn’t refresh this book. Your saved progress is kept.", "error"); }
    finally { setRefreshing(false); }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade/60" />
      </div>
    );
  }

  if (!manga || (isError && !isOfflineMode)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 text-slate-300">
        <p className="text-lg">Failed to load manga details.</p>
        <Link to="/library" className="mt-4 text-yomi-jade hover:underline">
          Return to Library
        </Link>
      </div>
    );
  }

  const handleLibraryClick = () => {
    if (manga.inLibrary) {
      setIsCategoryModalOpen(true);
    } else {
      toggleLibrary();
    }
  };

  return (
    <div className="yomi-manga-detail min-h-screen overflow-x-clip pb-20 lg:pb-0">
      <div className="yomi-book-toolbar"><Link to="/library" className="yomi-icon-button" aria-label="Back to library"><ArrowLeft /></Link><span className={stickyResume ? "" : "is-quiet"}>{manga.title}</span><div className="ml-auto flex shrink-0 items-center gap-2">{stickyResume && (firstUnreadChapter || continuation.first) && <Link to={`/reader/${(firstUnreadChapter || continuation.first)!.id}`} aria-label={`Resume ${manga.title}`} className="yomi-button yomi-button-primary"><Play />{firstUnreadChapter ? "Resume" : "Read again"}</Link>}<button className="yomi-icon-button" aria-label="Refresh book and chapters" disabled={refreshing || isOfflineMode} onClick={() => void refreshBook()}><RefreshCw className={refreshing ? "animate-spin" : ""} /></button>{sourceUrl && <><a className="yomi-icon-button" aria-label="Open book on source website" href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /></a><button className="yomi-icon-button" aria-label="Copy book link" onClick={async () => { try { await navigator.clipboard.writeText(sourceUrl); notify("Book link copied.", "success"); } catch { notify("The link couldn’t be copied. Open the source website to share its address.", "error"); } }}><Copy /></button></>}</div></div>
      {/* Top Banner & Metadata Area */}
      <div className="relative">
        {/* Blurred background */}
        <div
          className="yomi-manga-backdrop absolute inset-0 z-0 h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />

        {/* Content Container */}
        <div className="yomi-detail-summary relative z-10 mx-auto max-w-6xl px-6 pb-8 pt-2 lg:px-10 lg:pt-4">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            {/* Cover Image */}
            <div className="yomi-manga-cover relative mx-auto w-44 aspect-[2/3] shrink-0 overflow-hidden sm:mx-0 sm:w-48 md:w-52">
              <img src={imageUrl} alt={manga.title} className="absolute inset-0 h-full w-full object-cover" />
            </div>

            {/* Manga Info */}
            <div className="flex flex-col justify-end">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-white lg:text-4xl">
                {manga.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-slate-300">
                {manga.author && <span>By {manga.author}</span>}
                {manga.artist && manga.artist.trim().toLocaleLowerCase() !== manga.author?.trim().toLocaleLowerCase() && <span>Art: {manga.artist}</span>}
                {manga.status && manga.status !== "UNKNOWN" && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-slate-200">
                    {manga.status.replace(/_/g, " ")}
                  </span>
                )}
                {manga.source?.name && (
                  <span className="text-yomi-jade/80">{manga.source.name}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div ref={actionsRef} className="mt-6 flex flex-wrap gap-3">
                {isChaptersLoading ? (
                  <button
                    disabled
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 font-semibold text-slate-400 sm:flex-none"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading chapters
                  </button>
                ) : firstUnreadChapter ? (
                  <Link
                    to={`/reader/${firstUnreadChapter.id}`}
                    className="yomi-button yomi-button-primary flex-1 sm:flex-none"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Resume
                  </Link>
                ) : continuation.first ? (
                  <Link to={`/reader/${continuation.first.id}`} className="yomi-button yomi-button-secondary flex-1 sm:flex-none"><Play className="h-4 w-4" />Read again</Link>
                ) : (
                  <button
                    disabled
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 font-semibold text-slate-400 sm:flex-none"
                  >
                    No Chapters
                  </button>
                )}
                <button 
                  onClick={handleLibraryClick}
                  disabled={togglingLibrary}
                  className={`yomi-button flex-1 sm:flex-none ${
                    manga.inLibrary
                      ? "yomi-button-secondary"
                      : "yomi-button-secondary text-yomi-jade"
                  }`}
                >
                  {togglingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : manga.inLibrary ? "In Library" : "Add to Library"}
                </button>
                {manga.inLibrary && !isOfflineMode && (
                  <button
                    onClick={() => setIsMigrationOpen(true)}
                    className="yomi-button yomi-button-secondary flex-1 sm:flex-none"
                  >
                    Migrate Source
                  </button>
                )}
              </div>

              {/* Genres */}
              {manga.genre && manga.genre.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {manga.genre.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/5 bg-ink-850 px-3 py-1.5 text-xs text-slate-300 hover:border-white/10 hover:text-white transition duration-200"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {loadingDetails && <p className="mt-5 text-sm text-slate-400" role="status">Getting book details…</p>}
              {detailsFailed && <div className="mt-5 text-sm text-slate-400" role="status">Book details couldn’t be loaded. You can still read the available chapters. <button type="button" onClick={() => void retryDetails()} className="ml-1 text-yomi-jade underline underline-offset-4">Retry book details</button></div>}
              {manga.description && (
                <div className="mt-6"><p id="book-synopsis" className={`whitespace-pre-line text-sm leading-relaxed text-slate-400 ${synopsisOpen ? "" : "line-clamp-3"}`}>{manga.description}</p>{manga.description.length > 280 && <button className="yomi-text-link mt-2 text-xs" aria-controls="book-synopsis" aria-expanded={synopsisOpen} onClick={() => setSynopsisOpen(!synopsisOpen)}>{synopsisOpen ? "Show less" : "Read synopsis"}</button>}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="mx-auto max-w-5xl pb-12">
        <div className="yomi-content-surface rounded-t-2xl lg:rounded-2xl">
          {isChaptersLoading ? (
            <div className="flex min-h-48 items-center justify-center text-slate-400">
              <Loader2 className="mr-3 h-5 w-5 animate-spin text-yomi-jade" />
              Loading chapters...
            </div>
          ) : chapters.length === 0 ? (
            <div className="p-5">
              <SourceRecoveryPanel
                title="No chapters from this source."
                detail="The title loaded, but this source did not return a readable chapter list. Try the same title from another installed source."
                sourceName={manga.source?.name}
                searchedTitle={manga.title}
                className="border-white/5 bg-ink-950/40 shadow-none"
              />
            </div>
          ) : (
            <ChapterList chapters={chapters} mangaTitle={manga.title} mangaId={parsedMangaId} offline={isOfflineMode} />
          )}
        </div>

        {/* Tracker Syncing Panel */}
      <BookNotes backend={policyBackend} mangaId={manga.id} title={manga.title} />
      <TrackerPanel mangaId={manga.id} mangaTitle={manga.title} />
      </div>

      {/* Categories Selection Modal */}
      <MangaCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        mangaId={manga.id}
        currentCategoryIds={currentCategoryIds}
      />

      {/* Migration Modal */}
      <SourceMigrationModal
        isOpen={isMigrationOpen}
        onClose={() => setIsMigrationOpen(false)}
        mangaId={manga.id}
        mangaTitle={manga.title}
        sourceName={manga.source?.name || "Unknown"}
      />
    </div>
  );
}
