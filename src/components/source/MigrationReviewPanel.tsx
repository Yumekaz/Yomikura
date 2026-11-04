import { Link } from "react-router-dom";
import type { MigrationData, MigrationReview } from "./mangaMigration";

export function MigrationReviewPanel({ review, selected, onSelected, replace, onReplace, canReplace, onExecute, onRefresh, onSearch, data, onData, onShowEntry }: {
  review: MigrationReview; selected: Set<number>; onSelected: (selected: Set<number>) => void;
  replace: boolean; onReplace: (replace: boolean) => void; canReplace: boolean;
  onExecute: () => void; onRefresh: () => void; onSearch: () => void;
  data: MigrationData; onData: (data: MigrationData) => void;
  onShowEntry: () => void;
}) {
  const matches = review.rows.filter((row) => row.status === "matched").length;
  const unmatched = review.rows.filter((row) => row.status === "unmatched").length;
  const ambiguous = review.rows.filter((row) => row.status === "ambiguous").length;
  const canCopy = (data.chapters || data.categories) && (!data.chapters || matches > 0 && review.target.chapters.length > 0 && selected.size > 0);
  return <div className="space-y-4">
    <div><h3 className="text-sm font-semibold text-slate-100">Review: {review.source.title} → {review.target.title}</h3><p className="mt-2 text-sm text-slate-400">{matches} matched · {unmatched} unmatched · {ambiguous} ambiguous</p></div>
    <fieldset className="rounded-xl border border-white/10 p-4"><legend className="px-1 text-sm font-semibold text-slate-200">Select data to include</legend><div className="flex flex-wrap gap-6 text-sm text-slate-200"><label className="flex items-center gap-2"><input type="checkbox" checked={data.chapters} onChange={(event) => onData({ ...data, chapters: event.target.checked })} />Chapters</label><label className="flex items-center gap-2"><input type="checkbox" checked={data.categories} onChange={(event) => onData({ ...data, categories: event.target.checked })} />Categories</label></div><p className="mt-3 text-xs text-slate-400">Chapter data includes read status, bookmarks and safely matched reading positions. Categories are merged with the destination.</p></fieldset>
    {!canCopy && <p role="alert" className="text-sm text-amber-200">Choose data to include. Chapter transfers need at least one safely matched chapter; you can copy categories alone.</p>}
    {data.chapters && <div className="space-y-2" aria-label="Chapter mapping">
      {review.rows.map((row) => <div key={String(row.source.id)} className="rounded-lg border border-white/10 bg-ink-950/30 p-3 text-sm text-slate-300">
        <label className="flex items-start gap-3"><input type="checkbox" aria-label={`Copy ${row.source.name}`} disabled={row.status !== "matched"} checked={selected.has(Number(row.source.id))} onChange={(event) => {
          const next = new Set(selected); if (event.target.checked) next.add(Number(row.source.id)); else next.delete(Number(row.source.id)); onSelected(next);
        }} /><span>{row.source.name} → {row.target?.name ?? (row.status === "ambiguous" ? "Ambiguous match; no state will be copied" : "No match; no state will be copied")}</span></label>
        {row.positionSkipped && <p className="mt-2 text-xs text-amber-200">Page position will stay unchanged because page counts differ or are unknown. Read status and bookmarks can still be copied.</p>}
      </div>)}
    </div>}
    <p className="text-xs text-slate-400">Existing destination completion and bookmarks are preserved. Tracker links, reader settings and downloads stay with their original title. Notes are retained with both entries for recovery.</p>
    {review.notes.value && <details className="rounded-lg border border-white/10 p-3 text-sm text-slate-300"><summary>Notes to keep with the destination</summary><p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{review.notes.value}</p><p className="mt-2 text-xs text-slate-400">Existing notes and unsynced versions are preserved together. The original note stays with its book.</p></details>}
    <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={replace} disabled={!canReplace} onChange={(event) => onReplace(event.target.checked)} />Replace original in library</label>
    {!canReplace && <p className="text-xs text-slate-400">Replacement requires every chapter to match and all saved chapter state to be selected and transferable. You can copy the available selection and keep the original.</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={!canCopy} onClick={onExecute} className={`yomi-button ${replace ? "yomi-button-danger" : "yomi-button-primary"}`}>{replace ? "Copy and replace original" : "Copy and keep original"}</button><Link to={`/manga/${review.source.id}`} onClick={onShowEntry} className="yomi-button yomi-button-secondary">Show entry</Link><button type="button" onClick={onRefresh} className="yomi-button yomi-button-secondary">Refresh mapping</button><button type="button" onClick={onSearch} className="yomi-button yomi-button-secondary">Choose another title</button></div>
  </div>;
}
