import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import AxeBuilder from "@axe-core/playwright";

const backend = "http://127.0.0.1:45677";
function definitions(): any[] {
  return [
    { __typename: "HeaderFilter", name: "Catalog choices" },
    { __typename: "CheckBoxFilter", name: "Only completed", checkBoxDefault: false },
    { __typename: "TextFilter", name: "Title contains", textDefault: "" },
    { __typename: "SelectFilter", name: "Publication", values: ["Any", "Ongoing"], selectDefault: 0 },
    { __typename: "TriStateFilter", name: "Licensed", triStateDefault: "IGNORE" },
    { __typename: "SortFilter", name: "Order", values: ["Title", "Updated"], sortDefault: null },
    { __typename: "SeparatorFilter", name: "" },
    { __typename: "GroupFilter", name: "Genres", filters: [
      { __typename: "HeaderFilter", name: "Grouped choices" },
      { __typename: "CheckBoxFilter", name: "Fantasy", checkBoxDefault: false },
      { __typename: "TriStateFilter", name: "Adventure", triStateDefault: "IGNORE" },
      { __typename: "TextFilter", name: "Author", textDefault: "" },
      { __typename: "SelectFilter", name: "Language", values: ["Any", "English"], selectDefault: 0 },
      { __typename: "SortFilter", name: "Grouped order", values: ["A"], sortDefault: { index: 0, ascending: true } },
      { __typename: "GroupFilter", name: "Deeper group" },
    ] },
  ];
}
async function fixture(page: Page, options: { none?: boolean; hold?: string } = {}) {
  const state = { definitions: options.none ? [] : definitions(), calls: [] as any[], held: false, release: undefined as (() => void) | undefined };
  await page.addInitScript(({ backend }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected" } }));
  }, { backend });
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetSources") data = { sources: { totalCount: 1, nodes: [{ id: "100", name: "Filter source", lang: "en", supportsLatest: true, isNsfw: false, isConfigurable: false, extension: { isInstalled: true, pkgName: "fixture" } }] } };
    else if (name === "GetSourceFilters") data = { source: { id: variables.id, name: "Filter source", filters: state.definitions } };
    else if (name === "FetchSourceManga") {
      const input = variables.input; state.calls.push(structuredClone(input));
      if (options.hold !== undefined && input.query === options.hold && !state.held) { state.held = true; await new Promise<void>((resolve) => { state.release = resolve; }); }
      data = { fetchSourceManga: { hasNextPage: input.page < 3, mangas: [{ id: 1000 + input.page, title: `Result ${input.type} ${input.query || "all"} page ${input.page}`, thumbnailUrl: "", inLibrary: false }] } };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" };
    }
    try { await route.fulfill({ json: { data } }); } catch { /* A superseded query can be aborted before its fixture response is released. */ }
  });
  return state;
}
const last = (items: any[]) => items[items.length - 1];
async function openFilters(page: Page) {
  await page.getByRole("button", { name: /^Filters(?: applied.*)?$/, exact: false }).click();
  const form = page.getByRole("form", { name: "Catalog filters", exact: true }); await expect(form).toBeVisible(); return form;
}

test("catalog controls send supported typed changes with empty query and complete positions", async ({ page }, info) => {
  const state = await fixture(page); await page.goto("/browse/100"); const form = await openFilters(page);
  await form.getByRole("textbox", { name: "Title contains", exact: true }).fill("海賊 & %/#");
  await form.getByRole("combobox", { name: "Publication", exact: true }).selectOption("1");
  await form.getByRole("combobox", { name: "Licensed", exact: true }).selectOption("EXCLUDE");
  await form.getByRole("combobox", { name: "Order sort field", exact: true }).selectOption("0");
  await form.getByRole("checkbox", { name: "Order ascending", exact: true }).uncheck();
  await form.getByRole("checkbox", { name: "Fantasy", exact: true }).check();
  await form.getByRole("combobox", { name: "Adventure", exact: true }).selectOption("INCLUDE");
  await form.getByRole("textbox", { name: "Author", exact: true }).fill(" yomi  ");
  await expect(form.getByText("This control is unavailable with the connected server.", { exact: true })).toHaveCount(2);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((issue) => issue.impact === "serious" || issue.impact === "critical")).toEqual([]);
  await page.screenshot({ path: info.outputPath("catalog-filter-controls.png") });
  await form.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect.poll(() => last(state.calls)?.type).toBe("SEARCH");
  expect(last(state.calls)).toMatchObject({ source: "100", page: 1, query: "", filters: [
    { position: 1, checkBoxState: false }, { position: 2, textState: "海賊 & %/#" }, { position: 3, selectState: 1 }, { position: 4, triState: "EXCLUDE" }, { position: 5, sortState: { index: 0, ascending: false } },
    { position: 7, groupChange: { position: 1, checkBoxState: true } }, { position: 7, groupChange: { position: 2, triState: "INCLUDE" } }, { position: 7, groupChange: { position: 3, textState: " yomi  " } }, { position: 7, groupChange: { position: 4, selectState: 0 } },
  ] });
});

test("cancelling draft filters leaves the applied catalog and defaults unchanged", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100"); await expect(page.getByRole("link", { name: /Result POPULAR/ })).toBeVisible();
  const calls = state.calls.length; const form = await openFilters(page);
  await form.getByRole("textbox", { name: "Title contains", exact: true }).fill("unsaved draft");
  await form.getByRole("button", { name: "Cancel filters", exact: true }).click(); expect(state.calls).toHaveLength(calls);
  const reopened = await openFilters(page); await expect(reopened.getByRole("textbox", { name: "Title contains", exact: true })).toHaveValue("");
});

test("applying filters includes a typed title query without discarding it", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100");
  await page.getByRole("textbox", { name: "Search manga in source", exact: true }).fill("typed title");
  const form = await openFilters(page); await form.getByRole("checkbox", { name: "Fantasy", exact: true }).check();
  await form.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result SEARCH typed title page 1", exact: true })).toBeVisible();
  expect(last(state.calls)).toMatchObject({ query: "typed title", page: 1, type: "SEARCH" });
  await expect(page.getByRole("textbox", { name: "Search manga in source", exact: true })).toHaveValue("typed title");
});

test("pagination retains applied filters and a new query always starts at page one", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100"); const form = await openFilters(page);
  await form.getByRole("checkbox", { name: "Fantasy", exact: true }).check(); await form.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible(); const applied = structuredClone(last(state.calls).filters);
  await page.getByRole("button", { name: "Next Page", exact: true }).click(); await expect(page.getByRole("link", { name: "Result SEARCH all page 2", exact: true })).toBeVisible();
  expect(last(state.calls)).toMatchObject({ page: 2, filters: applied });
  await page.getByRole("textbox", { name: "Search manga in source", exact: true }).fill("Pepper & Carrot"); await page.getByRole("textbox", { name: "Search manga in source", exact: true }).press("Enter");
  await expect(page.getByRole("link", { name: "Result SEARCH Pepper & Carrot page 1", exact: true })).toBeVisible();
  expect(state.calls.filter((input) => input.query === "Pepper & Carrot").map((input) => input.page)).toEqual([1]); expect(last(state.calls).filters).toEqual(applied);
});

test("pinned filter-only searches retain choices through catalog navigation and reload", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100"); const form = await openFilters(page);
  await form.getByRole("checkbox", { name: "Fantasy", exact: true }).check(); await form.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible(); const applied = structuredClone(last(state.calls).filters);
  await page.getByRole("button", { name: "Pin Search", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save this search", exact: true });
  await dialog.getByRole("textbox").fill("My filtered search"); await dialog.getByRole("button", { name: "Save search", exact: true }).click();
  await page.getByRole("link", { name: "Back to sources", exact: true }).click();
  const saved = page.getByRole("link", { name: /My filtered search/ }); await expect(saved).toHaveAttribute("href", /filters=/); await saved.click();
  await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible(); await page.reload();
  const restored = await openFilters(page); await expect(restored.getByRole("checkbox", { name: "Fantasy", exact: true })).toBeChecked();
  expect(last(state.calls).filters).toEqual(applied);
});

test("applying provided defaults is a search and clearing filters restores the ordinary catalog", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100"); const form = await openFilters(page);
  await form.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible();
  expect(last(state.calls).filters).toContainEqual({ position: 1, checkBoxState: false });
  await page.getByRole("button", { name: "Clear filters", exact: true }).click(); await expect(page.getByRole("link", { name: "Result POPULAR all page 1", exact: true })).toBeVisible();
  expect(last(state.calls).filters).toBeUndefined();
});

test("a changed source definition blocks stale filter positions before the next catalog request", async ({ page }) => {
  const state = await fixture(page); await page.goto("/browse/100"); const form = await openFilters(page);
  await form.getByRole("checkbox", { name: "Fantasy", exact: true }).check(); await form.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible(); const calls = state.calls.length;
  state.definitions[1].name = "Updated completion choice";
  await page.getByRole("button", { name: "Next Page", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("filters changed"); expect(state.calls).toHaveLength(calls);
  await page.getByRole("button", { name: "Review filters", exact: true }).click(); await expect(page.getByRole("checkbox", { name: "Updated completion choice", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(page.getByRole("link", { name: "Result SEARCH all page 1", exact: true })).toBeVisible();
  expect(last(state.calls).page).toBe(1);
});

test("malformed saved filters require explicit recovery while preserving the title query", async ({ page }) => {
  const state = await fixture(page); await page.goto(`/browse/100?${new URLSearchParams({ query: "keep this query", filters: "{broken" })}`);
  await expect(page.getByRole("alert")).toContainText("Saved filters could not be read"); expect(state.calls).toEqual([]);
  await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await expect(page.getByRole("link", { name: "Result SEARCH keep this query page 1", exact: true })).toBeVisible();
  expect(last(state.calls)).toMatchObject({ query: "keep this query", page: 1 }); expect(last(state.calls).filters).toBeUndefined();
});

test("a superseded slow source response cannot replace the newer query results", async ({ page }) => {
  const state = await fixture(page, { hold: "older" });
  try {
    await page.goto("/browse/100?query=older"); await expect.poll(() => state.held).toBe(true);
    await page.getByRole("textbox", { name: "Search manga in source", exact: true }).fill("newer"); await page.getByRole("textbox", { name: "Search manga in source", exact: true }).press("Enter");
    await expect(page.getByRole("link", { name: "Result SEARCH newer page 1", exact: true })).toBeVisible(); state.release!();
    await expect(page.getByRole("link", { name: "Result SEARCH older page 1", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Search manga in source", exact: true })).toHaveValue("newer");
  } finally { state.release?.(); }
});

test("sources with no filters retain normal search and catalog behavior", async ({ page }) => {
  const state = await fixture(page, { none: true }); await page.goto("/browse/100");
  await expect(page.getByText("This source has no catalog filters.", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Result POPULAR all page 1", exact: true })).toBeVisible(); expect(last(state.calls).filters).toBeUndefined();
});
