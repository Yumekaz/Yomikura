import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { ChapterList, Chapter } from "./ChapterList";

export default function MangaDetailPage() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const { serverBaseUrl } = useSettingsStore();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["manga", mangaId, serverBaseUrl],
    queryFn: () => sdk.GetMangaDetails({ id: parseInt(mangaId!) }),
    enabled: !!serverBaseUrl && !!mangaId,
  });

  const manga = data?.manga;

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

  const chapters: Chapter[] = useMemo(() => {
    if (!manga?.chapters?.edges) return [];
    return manga.chapters.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null)
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
  }, [manga]);

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

  if (isError || !manga) {
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
  let imageUrl = "/placeholder-cover.jpg";
  if (manga.thumbnailUrl) {
    imageUrl = manga.thumbnailUrl.startsWith("http")
      ? manga.thumbnailUrl
      : `${serverBaseUrl.replace(/\/$/, "")}${manga.thumbnailUrl.startsWith("/") ? "" : "/"}${manga.thumbnailUrl}`;
  }

  return (
    <div className="min-h-screen bg-ink-950 pb-20 lg:pb-0">
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Content Container */}
        <div className="relative z-10 mx-auto max-w-5xl px-6 pb-8 pt-4 lg:px-12 lg:pt-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            {/* Cover Image */}
            <div className="mx-auto w-48 shrink-0 overflow-hidden rounded-lg shadow-2xl sm:mx-0 sm:w-56 md:w-64">
              <img src={imageUrl} alt={manga.title} className="aspect-[2/3] w-full object-cover" />
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
                {firstUnreadChapter ? (
                  <Link
                    to={`/reader/${firstUnreadChapter.id}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-yomi-jade px-6 py-3 font-semibold text-ink-950 transition hover:bg-yomi-jade/90 sm:flex-none"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Resume
                  </Link>
                ) : (
                  <button
                    disabled
                    className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white/10 px-6 py-3 font-semibold text-slate-400 sm:flex-none"
                  >
                    No Chapters
                  </button>
                )}
                <button 
                  onClick={() => toggleLibrary()}
                  disabled={togglingLibrary}
                  className={`flex flex-1 items-center justify-center rounded-md border px-6 py-3 font-semibold transition sm:flex-none ${
                    manga.inLibrary 
                      ? "border-white/10 bg-ink-900/50 text-slate-200 hover:bg-white/5" 
                      : "border-yomi-jade/30 bg-ink-900 text-yomi-jade hover:bg-ink-800"
                  }`}
                >
                  {togglingLibrary ? <Loader2 className="h-5 w-5 animate-spin" /> : manga.inLibrary ? "In Library" : "Add to Library"}
                </button>
              </div>

              {/* Genres */}
              {manga.genre && manga.genre.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {manga.genre.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/5 bg-ink-800 px-3 py-1 text-xs text-slate-300"
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
        <div className="rounded-t-2xl bg-ink-900 shadow-panel lg:rounded-2xl lg:border lg:border-white/5">
          <ChapterList chapters={chapters} />
        </div>
      </div>
    </div>
  );
}
