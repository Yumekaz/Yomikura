import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers, Loader2, RefreshCw } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import type { GetLibraryQuery } from "../../api/graphql/generated/graphql";
import { progressBackend } from "../../api/suwayomi/backendIdentity";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { SourceMigrationModal } from "../source/SourceMigrationModal";

type Manga = GetLibraryQuery["mangas"]["nodes"][number];
export function DuplicateScanner() {
  const { serverBaseUrl, mockMode } = useSettingsStore();
  const backend = useMemo(() => progressBackend(serverBaseUrl, mockMode), [serverBaseUrl, mockMode]);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const [selection, setSelection] = useState<{ source: Manga; target: Manga }>();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["library-duplicates", backend.key], queryFn: () => sdk.GetLibrary({ filter: { inLibrary: { equalTo: true } }, first: 1000 }),
    enabled: !!serverBaseUrl,
  });
  const duplicates = useMemo(() => {
    const groups = new Map<string, Manga[]>();
    for (const manga of data?.mangas.nodes ?? []) {
      const title = manga.title.normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (title) groups.set(title, [...(groups.get(title) ?? []), manga]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }, [data]);
  if (isLoading) return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-yomi-jade" /></div>;
  if (isError) return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center text-red-300"><AlertTriangle /><p>Failed to fetch library entries.</p><button type="button" onClick={() => void refetch()} className="yomi-button yomi-button-secondary"><RefreshCw />Retry</button></div>;
  return <div className="rounded-md border border-white/10 bg-ink-900 p-6 shadow-panel">
    <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Layers className="h-5 w-5 text-yomi-jade" />Duplicate Manga Scanner</h2>
    <p className="mt-2 text-sm text-slate-400">Find titles with matching names and review their chapters before copying or replacing an entry.</p>
    <div className="mt-6 space-y-5">
      {duplicates.map((group, index) => <div key={index} className="space-y-3 rounded-xl border border-white/5 bg-ink-950/20 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Title: “{group[0].title}”</h3>
        <div className="grid gap-3 sm:grid-cols-2">{group.map((manga) => <div key={manga.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-ink-950/40 p-3">
          <div className="flex min-w-0 items-center gap-2.5"><img src={manga.thumbnailUrl || "/placeholder-cover.svg"} alt="" className="h-10 w-7 rounded object-cover" /><span className="truncate text-xs font-semibold text-slate-200">{manga.title}</span></div>
          <div className="flex flex-col gap-2">{group.filter((other) => other.id !== manga.id).map((other) => <button type="button" key={other.id} onClick={() => setSelection({ source: manga, target: other })} className="rounded border border-yomi-jade/20 bg-yomi-jade/10 px-2.5 py-1 text-xs font-bold text-yomi-mint">Review merge into {other.id}</button>)}</div>
        </div>)}</div>
      </div>)}
      {!duplicates.length && <p className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-slate-400">No duplicate manga titles detected in your library.</p>}
      {data?.mangas.pageInfo.hasNextPage && <p className="text-xs text-slate-400">This scan covers the first 1,000 library entries.</p>}
    </div>
    {selection && <SourceMigrationModal isOpen onClose={() => setSelection(undefined)} mangaId={selection.source.id} mangaTitle={selection.source.title} sourceName="Library entry" initialTarget={{ id: selection.target.id, title: selection.target.title }} />}
  </div>;
}
