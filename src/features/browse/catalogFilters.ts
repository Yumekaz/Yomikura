import type { FilterChangeInput } from "../../api/graphql/generated/graphql";

export type FilterValue = string | boolean | number | { index: number; ascending: boolean } | null;
export type FilterValues = Record<string, FilterValue>;
export type FilterDescriptor = { __typename: string; name: string; default?: FilterValue; values?: string[]; filters?: FilterDescriptor[] };
type WireFilter = { __typename: string; name: string; checkBoxDefault?: boolean; textDefault?: string; selectDefault?: number; triStateDefault?: string; sortDefault?: { index: number; ascending: boolean } | null; values?: string[]; filters?: WireFilter[] };
export type FilterNode = { key: string; path: number[]; descriptor: FilterDescriptor; editable: boolean; children: FilterNode[] };
export type CatalogFilterModel = { sourceId: string; signature: string; nodes: FilterNode[]; controls: FilterNode[]; defaults: FilterValues };
export class CatalogFilterError extends Error { constructor(message: string) { super(message); this.name = "CatalogFilterError"; } }
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const sortValue = (value: FilterValue | undefined) => !!value && typeof value === "object" && !Array.isArray(value) && Number.isSafeInteger(value.index) && typeof value.ascending === "boolean";

export function normalizeCatalogFilters(filters: WireFilter[]): FilterDescriptor[] {
  return filters.map((filter) => {
    const defaults: Record<string, FilterValue | undefined> = { CheckBoxFilter: filter.checkBoxDefault, TextFilter: filter.textDefault, SelectFilter: filter.selectDefault, TriStateFilter: filter.triStateDefault, SortFilter: filter.sortDefault };
    return { __typename: filter.__typename, name: filter.name, default: defaults[filter.__typename], values: filter.values,
      ...(filter.filters ? { filters: normalizeCatalogFilters(filter.filters) } : {}),
    };
  });
}

function validValue(node: FilterNode, value: unknown) {
  const filter = node.descriptor;
  switch (filter.__typename) {
    case "CheckBoxFilter": return typeof value === "boolean";
    case "TextFilter": return typeof value === "string";
    case "SelectFilter": return Number.isSafeInteger(value) && (Number(value) >= 0 && Number(value) < (filter.values?.length ?? 0) || value === filter.default);
    case "TriStateFilter": return value === "IGNORE" || value === "INCLUDE" || value === "EXCLUDE";
    case "SortFilter": {
      if (value === null) return filter.default === null;
      if (!sortValue(value as FilterValue)) return false;
      const selected = value as { index: number; ascending: boolean };
      if (Object.keys(selected).some((key) => key !== "index" && key !== "ascending")) return false;
      return selected.index >= 0 && selected.index < (filter.values?.length ?? 0)
        || selected.index === -1 && sortValue(filter.default) && (filter.default as { index: number }).index === -1;
    }
    default: return false;
  }
}

/** Mirror the pinned backend's supported top-level and single-group changes. */
export function buildCatalogFilterModel(sourceId: string, filters: FilterDescriptor[]): CatalogFilterModel {
  const controls: FilterNode[] = [];
  const defaults: FilterValues = {};
  const visit = (descriptors: FilterDescriptor[], parent: number[] = []): FilterNode[] => descriptors.map((filter, position) => {
    const path = [...parent, position];
    const descriptor = { ...filter, ...(sortValue(filter.default) ? { default: { index: (filter.default as { index: number }).index, ascending: (filter.default as { ascending: boolean }).ascending } } : {}) };
    const node: FilterNode = { key: path.join("."), path, descriptor, editable: false, children: [] };
    if (filter.__typename === "GroupFilter" && path.length === 1 && filter.filters) node.children = visit(filter.filters, path);
    const permitted = path.length === 1 || path.length === 2 && ["CheckBoxFilter", "TextFilter", "SelectFilter", "TriStateFilter"].includes(filter.__typename);
    node.editable = permitted && validValue(node, descriptor.default);
    if (node.editable) { controls.push(node); defaults[node.key] = descriptor.default!; }
    return node;
  });
  const nodes = visit(filters);
  const signatureOf = (list: FilterDescriptor[]): unknown[] => list.map((filter) => [filter.__typename, filter.name, filter.values ?? null, filter.filters ? signatureOf(filter.filters) : null]);
  return { sourceId, signature: JSON.stringify(signatureOf(filters)), nodes, controls, defaults };
}

export function validateCatalogFilterValues(model: CatalogFilterModel, values: unknown): FilterValues {
  if (!values || typeof values !== "object" || Array.isArray(values)) throw new CatalogFilterError("Saved filters are not a valid set of choices. Review or reset them.");
  const supplied = values as Record<string, unknown>;
  const expected = model.controls.map((node) => node.key);
  if (Object.keys(supplied).length !== expected.length || Object.keys(supplied).some((key) => !own(model.defaults, key))) throw new CatalogFilterError("The available filter controls changed. Review the current choices before applying this search.");
  const normalized: FilterValues = {};
  for (const node of model.controls) {
    const value = supplied[node.key];
    if (!own(supplied, node.key) || !validValue(node, value)) throw new CatalogFilterError(`The saved choice for “${node.descriptor.name}” is no longer available. Review or reset the filters.`);
    normalized[node.key] = value && typeof value === "object" ? { index: (value as { index: number }).index, ascending: (value as { ascending: boolean }).ascending } : value as FilterValue;
  }
  return normalized;
}

export function catalogFilterChanges(model: CatalogFilterModel, input: FilterValues): FilterChangeInput[] {
  const values = validateCatalogFilterValues(model, input);
  return model.controls.flatMap((node) => {
    const value = values[node.key];
    const change: FilterChangeInput = { position: node.path[node.path.length - 1] };
    switch (node.descriptor.__typename) {
      case "CheckBoxFilter": change.checkBoxState = value as boolean; break;
      case "TextFilter": change.textState = value as string; break;
      case "SelectFilter": change.selectState = value as number; break;
      case "TriStateFilter": change.triState = value as FilterChangeInput["triState"]; break;
      case "SortFilter": if (value === null) return []; change.sortState = value as { index: number; ascending: boolean }; break;
      default: throw new CatalogFilterError("This filter is not supported by the connected server.");
    }
    return [node.path.length === 2 ? { position: node.path[0], groupChange: change } : change];
  });
}

export function activeCatalogFilterCount(model: CatalogFilterModel, values: FilterValues) {
  return model.controls.filter((node) => JSON.stringify(values[node.key]) !== JSON.stringify(model.defaults[node.key])).length;
}
export function serializeCatalogFilters(model: CatalogFilterModel, input: FilterValues): string {
  const values = validateCatalogFilterValues(model, input);
  // Applying provided defaults is still a filtered SEARCH, not a POPULAR request.
  if (!model.controls.length) return "{}";
  const result = JSON.stringify({ version: 1, sourceId: model.sourceId, schema: model.signature, values });
  if (result.length > 64_000) throw new CatalogFilterError("These filter choices are too large for a saved search link. Shorten text fields and try again.");
  return result;
}
export function restoreCatalogFilters(model: CatalogFilterModel, serialized: string | null): FilterValues {
  if (!serialized || serialized === "{}") return { ...model.defaults };
  if (serialized.length > 64_000) throw new CatalogFilterError("The saved filter link is too large. Review or reset the filters.");
  let saved: { version?: unknown; sourceId?: unknown; schema?: unknown; values?: unknown };
  try { saved = JSON.parse(serialized); } catch { throw new CatalogFilterError("Saved filters could not be read. Review or reset them before searching."); }
  if (!saved || saved.version !== 1 || saved.sourceId !== model.sourceId) throw new CatalogFilterError("These saved filters use an unsupported format or belong to another source. Review or reset them.");
  if (saved.schema !== model.signature) throw new CatalogFilterError("This source's filters changed after the search was saved. Review the current choices before searching.");
  return validateCatalogFilterValues(model, saved.values);
}
