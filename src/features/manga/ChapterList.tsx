import { Download, CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router-dom";

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
}

export function ChapterList({ chapters }: ChapterListProps) {
  // Sort chapters descending (highest number first)
  const sortedChapters = [...chapters].sort((a, b) => b.chapterNumber - a.chapterNumber);

  return (
    <div className="flex flex-col">
      <div className="border-b border-white/10 px-6 py-4">
        <h3 className="text-lg font-semibold text-slate-100">{chapters.length} Chapters</h3>
      </div>
      <div className="flex flex-col divide-y divide-white/5">
        {sortedChapters.map((chapter) => (
          <Link
            key={chapter.id}
            to={`/reader/${chapter.id}`}
            className={`flex items-center justify-between px-6 py-4 transition hover:bg-white/5 ${
              chapter.isRead ? "opacity-60" : "opacity-100"
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
                <span className="font-medium text-slate-200 line-clamp-1">
                  {chapter.name}
                </span>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>{new Date(parseInt(chapter.uploadDate)).toLocaleDateString()}</span>
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
              {chapter.isDownloaded && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yomi-jade/10 text-yomi-jade">
                  <Download className="h-4 w-4" />
                </div>
              )}
            </div>
          </Link>
        ))}
        {chapters.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            No chapters available.
          </div>
        )}
      </div>
    </div>
  );
}
