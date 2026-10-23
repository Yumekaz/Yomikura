import { useState } from "react";
import { CatalogFilterError, type CatalogFilterModel, type FilterNode, type FilterValue, type FilterValues, serializeCatalogFilters } from "./catalogFilters";

export function CatalogFilterForm({ model, initialValues, onApply, onCancel }: {
  model: CatalogFilterModel; initialValues: FilterValues; onApply: (serialized: string) => void; onCancel: () => void;
}) {
  const [values, setValues] = useState<FilterValues>({ ...initialValues });
  const [error, setError] = useState("");
  const change = (key: string, value: FilterValue) => setValues((previous) => ({ ...previous, [key]: value }));
  const control = (node: FilterNode) => {
    const filter = node.descriptor; const value = values[node.key];
    if (filter.__typename === "HeaderFilter") return <p key={node.key} className="text-sm font-semibold text-slate-200">{filter.name}</p>;
    if (filter.__typename === "SeparatorFilter") return <hr key={node.key} className="border-white/10" />;
    if (filter.__typename === "GroupFilter" && node.path.length === 1 && filter.filters) return <fieldset key={node.key} className="space-y-3 rounded-lg border border-white/10 p-3"><legend className="px-1 text-sm font-semibold text-slate-300">{filter.name}</legend>{node.children.length ? node.children.map(control) : <p className="text-xs text-slate-400">No options available.</p>}</fieldset>;
    if (!node.editable) return <div key={node.key} className="rounded-lg border border-white/5 p-3 text-xs text-slate-400"><p>{filter.name}</p><p className="mt-1">This control is unavailable with the connected server.</p></div>;
    const label = filter.name || "Source filter";
    switch (filter.__typename) {
      case "CheckBoxFilter": return <label key={node.key} className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={value === true} onChange={(event) => change(node.key, event.target.checked)} />{label}</label>;
      case "TextFilter": return <label key={node.key} className="block text-sm text-slate-300">{label}<input className="yomi-field mt-1 w-full min-w-0" value={value as string} onChange={(event) => change(node.key, event.target.value)} /></label>;
      case "SelectFilter": return <label key={node.key} className="block text-sm text-slate-300">{label}<select className="yomi-field yomi-select mt-1 w-full min-w-0" value={value as number} onChange={(event) => change(node.key, Number(event.target.value))}>
        {typeof filter.default === "number" && (filter.default < 0 || filter.default >= (filter.values?.length ?? 0)) && <option value={filter.default}>Source default</option>}
        {filter.values?.map((item, index) => <option key={index} value={index}>{item}</option>)}
      </select></label>;
      case "TriStateFilter": return <label key={node.key} className="block text-sm text-slate-300">{label}<select className="yomi-field yomi-select mt-1 w-full min-w-0" value={value as string} onChange={(event) => change(node.key, event.target.value)}><option value="IGNORE">Any</option><option value="INCLUDE">Include</option><option value="EXCLUDE">Exclude</option></select></label>;
      case "SortFilter": {
        const sort = value as { index: number; ascending: boolean } | null;
        const defaults = filter.default as { index: number; ascending: boolean } | null;
        return <fieldset key={node.key} className="space-y-2 rounded-lg border border-white/10 p-3"><legend className="px-1 text-sm text-slate-300">{label}</legend>
          <label className="block text-xs text-slate-400">Sort by<select aria-label={`${label} sort field`} className="yomi-field yomi-select mt-1 w-full min-w-0" value={sort?.index ?? "default"} onChange={(event) => change(node.key, event.target.value === "default" ? null : { index: Number(event.target.value), ascending: sort?.ascending ?? defaults?.ascending ?? true })}>
            {filter.default === null && <option value="default">Source default</option>}{defaults?.index === -1 && <option value="-1">Source default</option>}
            {filter.values?.map((item, index) => <option key={index} value={index} disabled={node.unavailableOptions?.includes(index)}>{item}{node.unavailableOptions?.includes(index) ? " (unavailable)" : ""}</option>)}
          </select></label>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" aria-label={`${label} ascending`} disabled={sort === null || !!sort && sort.index < 0} checked={sort?.ascending ?? false} onChange={(event) => { if (sort) change(node.key, { ...sort, ascending: event.target.checked }); }} />Ascending</label>
          {node.warning && <p className="text-xs text-slate-300">{node.warning}</p>}
        </fieldset>;
      }
      default: return null;
    }
  };
  return <form className="space-y-4 rounded-xl border border-white/10 bg-ink-900 p-4" aria-label="Catalog filters" onSubmit={(event) => {
    event.preventDefault();
    try { onApply(serializeCatalogFilters(model, values)); }
    catch (failure) { setError(failure instanceof CatalogFilterError ? failure.message : "The filter choices could not be applied."); }
  }}>
    <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-2">{model.nodes.map(control)}</div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={!model.controls.length} className="yomi-button yomi-button-primary">Apply filters</button><button type="button" className="yomi-button yomi-button-secondary" onClick={() => { setValues({ ...model.defaults }); setError(""); }}>Reset to defaults</button><button type="button" className="yomi-button yomi-button-secondary" onClick={onCancel}>Cancel filters</button></div>
  </form>;
}
