import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type SettingsSection = "connection" | "appearance" | "reader" | "backup" | "offline" | "advanced" | "about";

const entries: Array<{ section: SettingsSection; title: string; detail: string; keywords: string }> = [
  { section: "connection", title: "Server profiles", detail: "Connections, URLs, testing, profile import and export", keywords: "suwayomi server url profile connection cors" },
  { section: "appearance", title: "Appearance", detail: "Theme, accent, cover density, language and accessibility", keywords: "dark light system color contrast motion language" },
  { section: "reader", title: "Reader", detail: "Reading mode, spreads, transitions, downloads and key bindings", keywords: "webtoon rtl ltr pages keyboard auto scroll concurrency" },
  { section: "backup", title: "Backup and restore", detail: "Create, download, validate and restore library backups", keywords: "backup restore data recovery" },
  { section: "offline", title: "Offline storage", detail: "Saved chapters, storage usage and cleanup", keywords: "cache disk delete downloads storage" },
  { section: "advanced", title: "Advanced tools", detail: "Local imports, OPDS, trackers, diagnostics and maintenance", keywords: "cbz cbr pdf opds tracker extension duplicate reset portable" },
  { section: "about", title: "About Yomikura", detail: "Version, project links, privacy and support", keywords: "version license github help privacy" },
];

export function SettingsSearch({ onSelect }: { onSelect: (section: SettingsSection) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return entries.filter((entry) => `${entry.title} ${entry.detail} ${entry.keywords}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search settings…"
        aria-label="Search settings"
        className="yomi-field w-full !pl-10"
      />
      {query.trim() && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl" role="listbox" aria-label="Settings search results">
          {results.length ? results.map((result) => (
            <button
              type="button"
              role="option"
              key={result.section}
              onClick={() => { onSelect(result.section); setQuery(""); }}
              className="block w-full border-b border-white/5 px-4 py-3 text-left transition-[background-color] duration-150 last:border-0 hover:bg-white/5 focus-visible:bg-white/5"
            >
              <span className="block text-sm font-semibold text-slate-100">{result.title}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-400">{result.detail}</span>
            </button>
          )) : <p className="px-4 py-4 text-sm text-slate-400">No matching setting.</p>}
        </div>
      )}
    </div>
  );
}
