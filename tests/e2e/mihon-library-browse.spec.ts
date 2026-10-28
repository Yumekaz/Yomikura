import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockSdk } from "../../src/api/graphql/mockSdk";
const backend = "http://127.0.0.1:45679";
async function fixture(page: Page, options: { hideLibrary?: boolean; bookmarkError?: boolean } = {}) {
  const requests: { name: string; variables: any }[] = [];
  const books = [
    { id: 1, title: "Active story", unreadCount: 1, downloadCount: 1, sourceId: "a", status: "ONGOING", chapters: { totalCount: 3 } },
    { id: 2, title: "Finished publication", unreadCount: 3, downloadCount: 0, sourceId: "b", status: "COMPLETED", chapters: { totalCount: 3 } },
    { id: 3, title: "Caught up story", unreadCount: 0, downloadCount: 0, sourceId: "b", status: "ONGOING", chapters: { totalCount: 3 } },
  ].map((book) => ({ ...book, thumbnailUrl: null, lastReadChapter: null, categories: { nodes: [{ id: 1 }] } }));
  await page.addInitScript(({ backend, hide }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", experience: { hideLibraryEntries: hide }, themeMode: "light", colorPalette: "forest" } }));
  }, { backend, hide: !!options.hideLibrary });
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    requests.push({ name, variables });
    let data: unknown;
    if (name === "GetLibrary") data = { mangas: { nodes: books, pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (name === "GetBookmarkedLibraryChapters") {
      if (options.bookmarkError) return route.fulfill({ json: { errors: [{ message: "Bookmarks unavailable" }] } });
      data = { chapters: { totalCount: 1, nodes: [{ id: 11, mangaId: 1 }], pageInfo: { hasNextPage: false, endCursor: null } } };
    } else if (name === "GetSources") data = { sources: { totalCount: 2, pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? null : "page2" }, nodes: [{ id: variables.after ? "fr" : "6247824327199706550", name: variables.after ? "French source" : "English source", lang: variables.after ? "fr" : "en", supportsLatest: true, isNsfw: false, isConfigurable: false, iconUrl: null, extension: { pkgName: "multi", isInstalled: true } }] } };
    else if (name === "GetSourceFilters") data = { aboutServer: { version: "v2.3.2243" }, source: { id: variables.id, name: "French source", filters: [] } };
    else if (name === "FetchSourceManga") data = { fetchSourceManga: { hasNextPage: variables.input.page === 1, mangas: variables.input.page === 1 ? [{ id: 1, title: "Active story", thumbnailUrl: null, inLibrary: true }] : [{ id: 8, title: "Undiscovered story", thumbnailUrl: null, inLibrary: false }] } };
    else if (name === "GetHistory") data = { chapters: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
    else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  return requests;
}
const openFilters = async (page: Page) => { await page.locator(".yomi-library-filter-panel > summary").click(); };
test("library inclusion and exclusion combine, survive reload, and keep publication completion distinct", async ({ page }) => {
  await fixture(page); await page.goto("/library");
  await expect(page.locator(".yomi-book")).toHaveCount(3);
  await openFilters(page);
  await page.getByRole("checkbox", { name: "Started reading: any", exact: true }).click();
  await expect(page.locator(".yomi-book")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Unread chapters: any", exact: true }).click();
  await expect(page.locator(".yomi-book")).toHaveCount(1);
  await expect(page.locator(".yomi-book")).toContainText("Active story");
  await page.getByRole("checkbox", { name: "Unread chapters: included", exact: true }).click();
  await expect(page.locator(".yomi-book")).toContainText("Caught up story");
  await page.reload(); await openFilters(page);
  await expect(page.getByRole("checkbox", { name: "Unread chapters: excluded", exact: true })).toHaveAttribute("aria-checked", "mixed");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completed series: any", exact: true }).click();
  await expect(page.locator(".yomi-book")).toContainText("Finished publication");
  await expect(page.locator(".yomi-book")).toHaveCount(1);
});
test("bookmark filter uses authoritative chapter membership and preserves filter on failure", async ({ page }) => {
  await fixture(page, { bookmarkError: true }); await page.goto("/library"); await openFilters(page);
  await page.getByRole("checkbox", { name: "Bookmarked: any", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bookmarks couldn’t be checked" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry bookmarks" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Bookmarked: included", exact: true })).toHaveAttribute("aria-checked", "true");
});
test("per-collection sort remembers separate choices", async ({ page }) => {
  await fixture(page); await page.goto("/library"); await openFilters(page);
  await page.getByRole("checkbox", { name: "Remember a separate sort order for each collection" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Sort library", exact: true }).click();
  await page.getByRole("option", { name: "Total chapters", exact: true }).click();
  await page.getByRole("combobox", { name: "Collection", exact: true }).click();
  await page.getByRole("option", { name: "Default", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Sort library", exact: true })).toContainText("Title");
  await page.getByRole("combobox", { name: "Sort library", exact: true }).click();
  await page.getByRole("option", { name: "Date added", exact: true }).click();
  await page.getByRole("button", { name: "All books", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Sort library", exact: true })).toContainText("Total chapters");
});
test("source pagination includes multi-language children and preserves pin and last-used actions", async ({ page }) => {
  const requests = await fixture(page); await page.goto("/browse/sources");
  await expect(page.getByRole("link", { name: "Browse French source", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pin French source", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pinned sources", exact: true })).toContainText("French source");
  await page.getByRole("link", { name: "Latest from French source", exact: true }).click();
  await expect(page.getByRole("button", { name: "Latest", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => requests.filter((request) => request.name === "FetchSourceManga").map((request) => request.variables.input.type)).toEqual(["LATEST"]);
  await page.getByRole("link", { name: "Back to sources" }).click();
  await expect(page.getByRole("region", { name: "Last used source" })).toContainText("French source");
  await page.reload();
  await expect(page.getByRole("region", { name: "Pinned sources", exact: true })).toContainText("French source");
});
test("a hidden library-only result page can still advance to new books", async ({ page }) => {
  await fixture(page, { hideLibrary: true }); await page.goto("/browse/fr");
  await expect(page.getByRole("heading", { name: "These books are already in your library" })).toBeVisible();
  await page.getByRole("button", { name: "Next Page", exact: true }).click();
  await expect(page.getByRole("link", { name: "Undiscovered story", exact: true })).toBeVisible();
});
test("global search honors the same hide-library preference", async ({ page }) => {
  await fixture(page, { hideLibrary: true }); await page.goto("/browse/search?q=story");
  await expect(page.getByRole("heading", { name: "Global search" })).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: "Active story" })).toHaveCount(0);
});
test("filter sheet fits a narrow viewport and supports keyboard dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await fixture(page); await page.goto("/library"); await openFilters(page);
  await expect(page.getByRole("checkbox", { name: "Completed series: any", exact: true })).toBeVisible();
  const bounds = await page.locator(".yomi-filter-choices").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.getByRole("checkbox", { name: "Completed series: any", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".yomi-library-filter-panel > summary")).toBeFocused();
  await expect(page.locator(".yomi-library-filter-panel")).not.toHaveAttribute("open", "");
  expect((await new AxeBuilder({ page }).include(".yomi-library-tools").analyze()).violations).toEqual([]);
});
