import { CheckCircle2, HardDrive, Trash2 } from "lucide-react";
import type { CachedChapter } from "../../api/suwayomi/offlineCache";
import type { ConfirmOptions } from "../ui/FeedbackProvider";

type OfflineSettingsPanelProps = {
  cachedChapters: CachedChapter[];
  storageUsage: number;
  storageQuota: number;
  clearAll: () => Promise<void>;
  deleteChapter: (chapterId: number) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function OfflineSettingsPanel({
  cachedChapters,
  storageUsage,
  storageQuota,
  clearAll,
  deleteChapter,
  confirm,
}: OfflineSettingsPanelProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-yomi-jade" />
          Offline Storage Space
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Manage browser space allocated for cached chapters and reader images.
        </p>

        <div className="mt-6">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            <span>Space Used</span>
            <span>{formatBytes(storageUsage)} / {formatBytes(storageQuota || 10 * 1024 * 1024 * 1024)}</span>
          </div>
          <div className="w-full bg-ink-950 rounded-full h-3.5 border border-white/5 p-0.5 overflow-hidden">
            <div
              className="bg-yomi-jade h-full rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${Math.min(100, Math.max(1, storageQuota ? (storageUsage / storageQuota) * 100 : 0))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-medium">
            <span>Used: {storageQuota ? ((storageUsage / storageQuota) * 100).toFixed(2) : "0"}%</span>
            <span>Capacity: {formatBytes(storageQuota)}</span>
          </div>
        </div>

        <div className="mt-6 border-t border-white/5 pt-5 flex justify-end">
          <button
            onClick={async () => {
              if (await confirm({ title: "Clear every saved chapter?", detail: "All locally cached chapter pages will be removed from this device. Your library and server data remain intact.", confirmLabel: "Clear saved chapters", danger: true })) {
                await clearAll();
              }
            }}
            disabled={cachedChapters.length === 0}
            className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:text-red-300 transition disabled:opacity-30 disabled:pointer-events-none"
          >
            Clear Offline Cache
          </button>
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="h-4.5 w-4.5 text-yomi-jade" />
          Cached Chapters ({cachedChapters.length})
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Chapters currently saved inside browser memory for offline reading.
        </p>

        {cachedChapters.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-white/5 bg-ink-950/20 py-12 text-center text-slate-500 text-sm">
            No chapters cached yet. Use the download buttons on the manga details pages to save files.
          </div>
        ) : (
          <div className="mt-6 divide-y divide-white/5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {cachedChapters.map((chapter) => (
              <div key={chapter.id} className="flex items-center justify-between py-3.5 gap-4">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-slate-200 truncate">{chapter.mangaTitle}</h4>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{chapter.name}</p>
                  <div className="flex gap-2 text-[10px] text-slate-500 mt-1 font-medium">
                    <span>{chapter.pageCount} Pages</span>
                    <span>•</span>
                    <span>{formatBytes(chapter.totalSizeBytes)}</span>
                    <span>•</span>
                    <span>Saved {new Date(chapter.cachedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (await confirm({ title: "Remove saved chapter?", detail: `Delete the offline pages for “${chapter.name}”? Reading progress and server data remain intact.`, confirmLabel: "Remove download", danger: true })) {
                      await deleteChapter(chapter.id);
                    }
                  }}
                  className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
                  title="Delete Cache"
                  aria-label={`Remove offline download ${chapter.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
