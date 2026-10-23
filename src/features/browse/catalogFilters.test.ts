import { describe, expect, it } from "vitest";
import { activeCatalogFilterCount, buildCatalogFilterModel, catalogFilterChanges, normalizeCatalogFilters, restoreCatalogFilters, serializeCatalogFilters, type FilterDescriptor } from "./catalogFilters";
import { buildSourceBrowsePath } from "./sourceBrowseRoute";

const definitions = (): FilterDescriptor[] => [
  { __typename: "HeaderFilter", name: "Reading choices" },
  { __typename: "CheckBoxFilter", name: "Only completed", default: false },
  { __typename: "TextFilter", name: "Title contains", default: "default" },
  { __typename: "SelectFilter", name: "Publication", values: ["Any", "Ongoing"], default: 0 },
  { __typename: "TriStateFilter", name: "Licensed", default: "IGNORE" },
  { __typename: "SortFilter", name: "Order", values: ["Title", "Updated"], default: null },
  { __typename: "SeparatorFilter", name: "" },
  { __typename: "GroupFilter", name: "Genres", filters: [
    { __typename: "HeaderFilter", name: "Grouped choices" },
    { __typename: "CheckBoxFilter", name: "Fantasy", default: false },
    { __typename: "TriStateFilter", name: "Adventure", default: "IGNORE" },
    { __typename: "TextFilter", name: "Author", default: "" },
    { __typename: "SelectFilter", name: "Language", values: ["Any", "English"], default: 0 },
    { __typename: "SortFilter", name: "Unsupported grouped sort", values: ["A"], default: { index: 0, ascending: true } },
    { __typename: "GroupFilter", name: "Unsupported nested group", filters: [{ __typename: "CheckBoxFilter", name: "Nested", default: false }] },
  ] },
];
const model = () => buildCatalogFilterModel("100", definitions());

describe("catalog filter contract", () => {
  it("normalizes aliased GraphQL defaults without losing zero, false or empty strings", () => {
    expect(normalizeCatalogFilters([
      { __typename: "CheckBoxFilter", name: "Checkbox", checkBoxDefault: false },
      { __typename: "SelectFilter", name: "Select", values: ["Any"], selectDefault: 0 },
      { __typename: "TextFilter", name: "Text", textDefault: "" },
      { __typename: "SortFilter", name: "Sort", values: ["A"], sortDefault: null },
    ]).map((filter) => filter.default)).toEqual([false, 0, "", null]);
  });
  it("preserves absolute positions including headers and separators, with supported child positions", () => {
    const schema = model();
    const changes = catalogFilterChanges(schema, { ...schema.defaults, 1: true, 2: "海賊 & %/#", 3: 1, 4: "EXCLUDE", 5: { index: 0, ascending: false }, "7.1": true, "7.2": "INCLUDE", "7.3": " yomi  ", "7.4": 1 });
    expect(changes).toEqual([
      { position: 1, checkBoxState: true }, { position: 2, textState: "海賊 & %/#" }, { position: 3, selectState: 1 }, { position: 4, triState: "EXCLUDE" }, { position: 5, sortState: { index: 0, ascending: false } },
      { position: 7, groupChange: { position: 1, checkBoxState: true } }, { position: 7, groupChange: { position: 2, triState: "INCLUDE" } }, { position: 7, groupChange: { position: 3, textState: " yomi  " } }, { position: 7, groupChange: { position: 4, selectState: 1 } },
    ]);
  });
  it("keeps false, empty text and select zero in a complete request, while omitting a null sort", () => {
    const schema = model(); const changes = catalogFilterChanges(schema, { ...schema.defaults, 2: "" });
    expect(changes).toContainEqual({ position: 1, checkBoxState: false });
    expect(changes).toContainEqual({ position: 2, textState: "" }); expect(changes).toContainEqual({ position: 3, selectState: 0 });
    expect(changes.some((change) => change.position === 5)).toBe(false);
  });
  it("retains filtered-search intent even when all choices equal the provided defaults", () => {
    const schema = model(); const serialized = serializeCatalogFilters(schema, schema.defaults);
    expect(JSON.parse(serialized).version).toBe(1); expect(activeCatalogFilterCount(schema, schema.defaults)).toBe(0);
    expect(restoreCatalogFilters(schema, serialized)).toEqual(schema.defaults);
  });
  it("round-trips saved choices and query text in the existing source-link contract", () => {
    const schema = model(); const values = { ...schema.defaults, 2: "海賊 & #1? +100%" };
    const serialized = serializeCatalogFilters(schema, values);
    const path = new URL(buildSourceBrowsePath("100", "Old & new / #1? +100%", serialized), "https://app.example");
    expect(path.searchParams.get("query")).toBe("Old & new / #1? +100%");
    expect(restoreCatalogFilters(schema, path.searchParams.get("filters"))).toEqual(values);
    expect(new URL(buildSourceBrowsePath("100", "Old links", "{}"), "https://app.example").searchParams.has("filters")).toBe(false);
  });
  it("does not silently replay positions after controls or option order change", () => {
    const schema = model(); const saved = serializeCatalogFilters(schema, schema.defaults);
    const renamed = definitions(); renamed[1].name = "Changed control";
    expect(() => restoreCatalogFilters(buildCatalogFilterModel("100", renamed), saved)).toThrow("filters changed");
    const reordered = definitions(); reordered[3].values = ["Ongoing", "Any"];
    expect(() => restoreCatalogFilters(buildCatalogFilterModel("100", reordered), saved)).toThrow("filters changed");
    expect(() => restoreCatalogFilters(buildCatalogFilterModel("200", definitions()), saved)).toThrow("another source");
  });
  it("keeps explicitly saved choices when only a provided default changes", () => {
    const schema = model(); const saved = serializeCatalogFilters(schema, schema.defaults);
    const changed = definitions(); changed[1].default = true;
    const fresh = buildCatalogFilterModel("100", changed);
    expect(fresh.signature).toBe(schema.signature); expect(restoreCatalogFilters(fresh, saved)[1]).toBe(false);
  });
  it.each([
    ["1", "false"], ["3", 5], ["3", 1.5], ["4", "UNKNOWN"], ["5", { index: 2, ascending: true }], ["5", { index: 0, ascending: "false" }],
  ])("rejects an invalid saved value at %s", (key, value) => {
    const schema = model(); const saved = JSON.parse(serializeCatalogFilters(schema, schema.defaults)); saved.values[String(key)] = value;
    expect(() => restoreCatalogFilters(schema, JSON.stringify(saved))).toThrow("no longer available");
  });
  it("does not emit unsupported nested-group or grouped-sort changes", () => {
    const schema = model(); expect(schema.controls.some((node) => node.key === "7.5" || node.key.startsWith("7.6"))).toBe(false);
    const saved = JSON.parse(serializeCatalogFilters(schema, schema.defaults)); saved.values["7.5"] = { index: 0, ascending: true };
    expect(() => restoreCatalogFilters(schema, JSON.stringify(saved))).toThrow("controls changed");
  });
  it("preserves advertised select and sort sentinel defaults without allowing invented negative indices", () => {
    const schema = buildCatalogFilterModel("100", [{ __typename: "SelectFilter", name: "Select", values: ["A"], default: -1 }, { __typename: "SortFilter", name: "Sort", values: ["A"], default: { index: -1, ascending: false } }]);
    expect(catalogFilterChanges(schema, schema.defaults)).toEqual([{ position: 0, selectState: -1 }, { position: 1, sortState: { index: -1, ascending: false } }]);
    expect(() => catalogFilterChanges(schema, { ...schema.defaults, 0: -2 })).toThrow("no longer available");
  });
  it("rejects a null saved sort when the server no longer offers a null default", () => {
    const schema = model(); const saved = serializeCatalogFilters(schema, schema.defaults);
    const changed = definitions(); changed[5].default = { index: 0, ascending: true };
    expect(() => restoreCatalogFilters(buildCatalogFilterModel("100", changed), saved)).toThrow("no longer available");
  });
  it.each(["{broken", "null", "[]", '{"version":2}', "x".repeat(64_001)])("rejects malformed or unsupported saved input", (serialized) => {
    expect(() => restoreCatalogFilters(model(), serialized)).toThrow();
  });
});
