import { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraphQLClient, gql } from "graphql-request";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { SourceRecoveryPanel } from "../../components/source/SourceRecoveryPanel";
import { ChapterList, Chapter } from "./ChapterList";
import { MangaCategoryModal } from "./MangaCategoryModal";
import { TrackerPanel } from "./TrackerPanel";
import { useDownloadStore } from "../../stores/useDownloadStore";
import { SourceMigrationModal } from "../../components/source/SourceMigrationModal";


const FETCH_CHAPTERS_DOCUMENT = gql`
  mutation FetchChapters($input: FetchChaptersInput!) {
    fetchChapters(input: $input) {
      chapters {
        id
        name
        chapterNumber
        isRead
        isBookmarked
        isDownloaded
        uploadDate
        scanlator
      }
    }
  }
`;

type ChapterNode = {
  id: number;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  isDownloaded: boolean;
  uploadDate: string | number;
  scanlator?: string | null;
};

type FetchChaptersResponse = {
  fetchChapters?: {
    chapters: ChapterNode[];
  } | null;
};

export default function MangaDetailPage() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const { serverBaseUrl } = useSettingsStore();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);

  const { loadCachedChapters, cachedChapters } = useDownloadStore();

  useEffect(() => {
    void loadCachedChapters();
  }, [loadCachedChapters]);

  const graphqlEndpoint = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return cleanUrl ? `${cleanUrl}/api/graphql` : "";
  }, [serverBaseUrl]);

  const sdk = useMemo(() => {
    return createGraphqlClient(graphqlEndpoint);
  }, [graphqlEndpoint]);

  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["manga", mangaId, serverBaseUrl],
    queryFn: () => sdk.GetMangaDetails({ id: parseInt(mangaId!) }),
    enabled: !!serverBaseUrl && !!mangaId,
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
        author: "Offline Mode",
        status: "COMPLETED",
        source: { name: "Offline Cache" },
        genre: ["Cached"],
        description: "Viewing in offline mode. Only cached chapters are available.",
        categories: { edges: [] },
        chapters: { edges: [] },
      };
    }
    return data?.manga;
  }, [data?.manga, isOfflineMode, offlineChapters, parsedMangaId]);

  const { data: fetchedChaptersData, isLoading: chaptersLoading } = useQuery({
    queryKey: ["manga-chapters", mangaId, serverBaseUrl],
    queryFn: async () => {
      if (useSettingsStore.getState().mockMode) {
        return { fetchChapters: null };
      }
      const client = new GraphQLClient(graphqlEndpoint);
      return client.request<FetchChaptersResponse>(FETCH_CHAPTERS_DOCUMENT, {
        input: { mangaId: parseInt(mangaId!) },
      });
    },
    enabled: !!graphqlEndpoint && !!mangaId && !!manga && !isOfflineMode && !useSettingsStore.getState().mockMode,
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
    if (!manga?.categories?.edges) return [];
    return manga.categories.edges
      .map((edge) => edge?.node?.id)
      .filter((id): id is number => id != null)
      .map(id => parseInt(String(id)));
  }, [manga]);

  const chapters: Chapter[] = useMemo(() => {
    if (isOfflineMode) {
      return offlineChapters.map((c) => ({
        id: c.id,
        name: c.name,
        chapterNumber: c.chapterNumber,
        isRead: !!c.isRead,
        isBookmarked: false,
        isDownloaded: true,
        uploadDate: String(c.cachedAt),
        scanlator: "Offline",
      }));
    }

    const fetchedChapters = fetchedChaptersData?.fetchChapters?.chapters ?? [];
    const cachedChaptersFromManga = manga?.chapters?.edges
      ?.map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null) ?? [];

    const sourceChapters = fetchedChapters.length > 0 ? fetchedChapters : cachedChaptersFromManga;

    return sourceChapters
      .map((c) => ({
        id: c.id,
        name: c.name,
        chapterNumber: c.chapterNumber,
        isRead: c.isRead,
        isBookmarked: c.isBookmarked,
        isDownloaded: c.isDownloaded,
        uploadDate: String(c.uploadDate),
        scanlator: c.scanlator,
      }));
  }, [fetchedChaptersData, manga, isOfflineMode, offlineChapters]);

  const isChaptersLoading = isOfflineMode ? false : chaptersLoading;

  // Find the first unread chapter to resume reading
  const firstUnreadChapter = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    return sorted.find((c) => !c.isRead) || sorted[0];
  }, [chapters]);

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

  // Handle absolute or relative thumbnail URLs safely
  let imageUrl = "/placeholder-cover.svg";
  if (manga.thumbnailUrl) {
    imageUrl = manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`;
  }

  const handleLibraryClick = () => {
    if (manga.inLibrary) {
      setIsCategoryModalOpen(true);
    } else {
      toggleLibrary();
    }
  };

  return (
    <div className="min-h-screen bg-transparent pb-20 lg:pb-0">
      {/* Top Banner & Metadata Area */}
      <div className="relative">
        {/* Blurred background */}
        <div
          className="absolute inset-0 z-0 h-full w-full bg-cover bg-center opacity-20 blur-xl saturate-150 [mask-image:linear-gradient(to_bottom,white_40%,transparent)]"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />

        {/* Navigation Bar */}
        <div className="relative z-20 flex items-center gap-4 p-4 lg:p-6">
          <Link
            to="/library"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white border border-white/5 backdrop-blur-md transition-all duration-200 hover:bg-black/60 hover:border-white/20 hover:scale-105"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Content Container */}
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-8 pt-4 lg:px-12 lg:pt-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            {/* Cover Image */}
            <div className="relative mx-auto w-48 aspect-[2/3] shrink-0 overflow-hidden rounded-xl border border-white/10 hover:border-yomi-jade/30 transition-all duration-300 shadow-2xl sm:mx-0 sm:w-56 md:w-64 group/cover shadow-glow-hover">
              <img src={imageUrl} alt={manga.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/cover:scale-105" />
            </div>

            {/* Manga Info */}
            <div className="flex flex-col justify-end">
              <h1 className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                {manga.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-slate-300">
                {manga.author && <span>{manga.author}</span>}
                {manga.status && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-slate-200">
                    {manga.status.replace(/_/g, " ")}
                  </span>
                )}
                {manga.source?.name && (
                  <span className="text-yomi-jade/80">{manga.source.name}</span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap gap-3">
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
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yomi-jade px-6 py-3 font-semibold text-ink-950 transition-all duration-300 hover:bg-yomi-jade/90 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-glow sm:flex-none"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Resume
                  </Link>
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
                  className={`flex flex-1 items-center justify-center rounded-xl border px-6 py-3 font-semibold transition-all duration-300 sm:flex-none hover:scale-[1.02] active:scale-[0.98] ${
                    manga.inLibrary 
                      ? "border-white/10 bg-ink-900/50 text-slate-200 hover:bg-white/5 hover:border-white/20" 
                      : "border-yomi-jade/30 bg-ink-900 text-yomi-jade hover:bg-ink-800 hover:border-yomi-jade/60 hover:shadow-glow-hover"
                  }`}
                >
                  {togglingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : manga.inLibrary ? "In Library" : "Add to Library"}
                </button>
                {manga.inLibrary && !isOfflineMode && (
                  <button
                    onClick={() => setIsMigrationOpen(true)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-ink-900/50 px-6 py-3 font-semibold text-slate-300 hover:bg-white/5 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] sm:flex-none"
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
              {manga.description && (
                <p className="mt-6 line-clamp-4 text-sm leading-relaxed text-slate-400 md:line-clamp-none">
                  {manga.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="mx-auto max-w-5xl pb-12">
        <div className="rounded-t-2xl bg-ink-900/50 backdrop-blur-md shadow-panel lg:rounded-2xl lg:border lg:border-white/5">
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
            <ChapterList chapters={chapters} mangaTitle={manga.title} />
          )}
        </div>

        {/* Tracker Syncing Panel */}
        <TrackerPanel mangaId={manga.id} />
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
