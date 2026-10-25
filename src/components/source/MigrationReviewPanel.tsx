import type { MigrationReview } from "./mangaMigration";

export function MigrationReviewPanel({ review, selected, onSelected, replace, onReplace, canReplace, onExecute, onRefresh, onSearch }: {
  review: MigrationReview; selected: Set<number>; onSelected: (selected: Set<number>) => void;
  replace: boolean; onReplace: (replace: boolean) => void; canReplace: boolean;
  onExecute: () => void; onRefresh: () => void; onSearch: () => void;
}) {
  const matches = review.rows.filter((row) => row.status === "matched").length;
  const unmatched = review.rows.filter((row) => row.status === "unmatched").length;
  const ambiguous = review.rows.filter((row) => row.status === "ambiguous").length;
  const canCopy = matches > 0 && review.target.chapters.length > 0 && selected.size > 0;
  return <div className="space-y-4">
    <div><h3 className="text-sm font-semibold text-slate-100">Review: {review.source.title} → {review.target.title}</h3><p className="mt-2 text-sm text-slate-400">{matches} matched · {unmatched} unmatched · {ambiguous} ambiguous</p></div>
    {!canCopy && <p role="alert" className="text-sm text-amber-200">No selected, safely matched chapters are available. Refresh the mapping or choose another destination.</p>}
    <div className="space-y-2" aria-label="Chapter mapping">
      {review.rows.map((row) => <div key={String(row.source.id)} className="rounded-lg border border-white/10 bg-ink-950/30 p-3 text-sm text-slate-300">
        <label className="flex items-start gap-3"><input type="checkbox" aria-label={`Copy ${row.source.name}`} disabled={row.status !== "matched"} checked={selected.has(Number(row.source.id))} onChange={(event) => {
          const next = new Set(selected); if (event.target.checked) next.add(Number(row.source.id)); else next.delete(Number(row.source.id)); onSelected(next);
        }} /><span>{row.source.name} → {row.target?.name ?? (row.status === "ambiguous" ? "Ambiguous match; no state will be copied" : "No match; no state will be copied")}</span></label>
        {row.positionSkipped && <p className="mt-2 text-xs text-amber-200">Page position will stay unchanged because page counts differ or are unknown. Read status and bookmarks can still be copied.</p>}
      </div>)}
    </div>
    <p className="text-xs text-slate-400">Named categories are merged. Existing destination completion and bookmarks are preserved. Tracker links, reader settings and downloads stay with their original title.</p>
    <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={replace} disabled={!canReplace} onChange={(event) => onReplace(event.target.checked)} />Replace original in library</label>
    {!canReplace && <p className="text-xs text-slate-400">Replacement requires every chapter to match and all saved chapter state to be selected and transferable. You can copy the available selection and keep the original.</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={!canCopy} onClick={onExecute} className={`yomi-button ${replace ? "yomi-button-danger" : "yomi-button-primary"}`}>{replace ? "Copy and replace original" : "Copy and keep original"}</button><button type="button" onClick={onRefresh} className="yomi-button yomi-button-secondary">Refresh mapping</button><button type="button" onClick={onSearch} className="yomi-button yomi-button-secondary">Choose another title</button></div>
  </div>;
}
