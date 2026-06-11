import { Download, CheckCircle2, Circle, Loader2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useDownloadStore } from "../../stores/useDownloadStore";

export interface Chapter {
  id: string | number;
  name: string;
  chapterNumber: number;
  isRead: boolean;
  isBookmarked: boolean;
  isDownloaded: boolean;
  uploadDate: string;
  scanlator?: string | null;
}

interface ChapterListProps {
  chapters: Chapter[];
  mangaTitle?: string;
}

export function ChapterList({ chapters, mangaTitle }: ChapterListProps) {
  // Sort chapters descending (highest number first)
  const sortedChapters = [...chapters].sort((a, b) => b.chapterNumber - a.chapterNumber);

  const { activeDownloads, cachedChapterIds, downloadChapter, deleteChapter } = useDownloadStore();

  const handleDownloadClick = async (e: React.MouseEvent, chapterId: number) => {
    e.preventDefault();
    e.stopPropagation();
    await downloadChapter(chapterId, mangaTitle);
  };

  const handleDeleteClick = async (e: React.MouseEvent, chapterId: number, chapterName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Remove offline cache for "${chapterName}"?`)) {
      await deleteChapter(chapterId);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-white/10 px-6 py-4">
        <h3 className="text-lg font-semibold text-slate-100">{chapters.length} Chapters</h3>
      </div>
      <div className="flex flex-col divide-y divide-white/5">
        {sortedChapters.map((chapter) => {
          const chapId = Number(chapter.id);
          const isCached = cachedChapterIds.has(chapId);
          const download = activeDownloads[chapId];
          const isDownloading = download?.status === "downloading";
          const isError = download?.status === "error";

          return (
            <Link
              key={chapter.id}
              to={`/reader/${chapter.id}`}
              className={`flex items-center justify-between px-6 py-4 transition hover:bg-white/5 ${
                chapter.isRead
                  ? "opacity-55 bg-white/[0.02] grayscale-[0.25]"
                  : "opacity-100"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 flex-shrink-0 text-slate-500">
                  {chapter.isRead ? (
                    <CheckCircle2 className="h-5 w-5 text-yomi-jade" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span
                    className={`font-medium line-clamp-1 ${
                      chapter.isRead ? "text-slate-500" : "text-slate-200"
                    }`}
                  >
                    {chapter.name}
                  </span>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{new Date(parseInt(chapter.uploadDate) < 30000000000 ? parseInt(chapter.uploadDate) * 1000 : parseInt(chapter.uploadDate)).toLocaleDateString()}</span>
                    {chapter.scanlator && (
                      <>
                        <span>•</span>
                        <span className="line-clamp-1">{chapter.scanlator}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Server downloaded indicator */}
                {chapter.isDownloaded && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400" title="Downloaded on server">
                    <Download className="h-4 w-4" />
                  </div>
                )}

                {/* Browser offline cache downloader */}
                <div className="flex items-center">
                  {isCached ? (
                    <button
                      onClick={(e) => handleDeleteClick(e, chapId, chapter.name)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-yomi-jade/10 text-yomi-jade hover:bg-red-500/20 hover:text-red-400 transition"
                      title="Cached offline. Click to remove."
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  ) : isDownloading ? (
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-yomi-jade">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>
                        {download.total > 0 
                          ? `${Math.round((download.progress / download.total) * 100)}%`
                          : "Connecting"
                        }
                      </span>
                    </div>
                  ) : isError ? (
                    <button
                      onClick={(e) => handleDownloadClick(e, chapId)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                      title={`Download failed: ${download.error || "Retry"}. Click to retry.`}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleDownloadClick(e, chapId)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-yomi-jade hover:text-ink-950 hover:border-yomi-jade transition"
                      title="Save for offline"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {chapters.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            No chapters available.
          </div>
        )}
      </div>
    </div>
  );
}
