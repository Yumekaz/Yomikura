import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockSdk } from "../../src/api/graphql/mockSdk";
test.use({ serviceWorkers: "block" });
const server = "http://127.0.0.1:45677";
async function fixture(page: Page, options: { incomplete?: boolean; rejectOrder?: boolean; light?: boolean } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00Z"));
  const categories = [{ id: 1, name: "Reading", order: 1 }, { id: 2, name: "Favorites", order: 2 }];
  const book = { id: 10001, title: "Weekly Lantern", thumbnailUrl: "/demo/paper-garden.webp", status: "ONGOING", genre: ["Fantasy"], unreadCount: 40, downloadCount: 3, chapters: { totalCount: 100 }, trackRecords: { totalCount: 1 }, categories: { nodes: [{ id: 1, name: "Reading" }] } };
  const books = [book, { ...book, id: 10002, title: "Finished Garden", status: "COMPLETED", chapters: { totalCount: 20 }, unreadCount: 0, downloadCount: 0, trackRecords: { totalCount: 0 }, categories: { nodes: [{ id: 2, name: "Favorites" }] } }];
  const samples: number[] = [], moves: unknown[] = [];
  await page.addInitScript(({ server, light }) => { localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: server, mockMode: false, connectionStatus: "connected", themeMode: light ? "light" : "dark", colorPalette: light ? "moonstone" : "ember", profiles: [{ id: "one", name: "Reading library", url: server }], activeProfileId: "one" } })); }, { server, light: options.light });
  await page.route("**/api/graphql", async (route) => {
    const { operationName, query, variables = {} } = route.request().postDataJSON(), name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1]; let data: unknown;
    if (name === "GetLibraryInsights") data = { mangas: { nodes: options.incomplete ? [book] : books, totalCount: 2, pageInfo: { hasNextPage: !!options.incomplete, endCursor: options.incomplete ? "repeated" : null } } };
    else if (name === "GetReleaseSample") { samples.push(variables.id); data = { chapters: { nodes: ["2026-10-08", "2026-10-01", "2026-09-24", "2026-09-17"].map((date, index) => ({ chapterNumber: 4 - index, uploadDate: `${date}T08:00:00Z` })) } }; }
    else if (name === "GetUpdates") data = { chapters: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 20001, mangaId: 10001, name: "Chapter 4", chapterNumber: 4, isRead: false, lastPageRead: 3, pageCount: 20, isDownloaded: true, fetchedAt: "2026-10-10T11:00:00Z", uploadDate: "2026-10-08T08:00:00Z", scanlator: "Original source", manga: { ...book, inLibraryAt: "2026-01-01T00:00:00Z" } }] } };
    else if (name === "GetCategories") data = { categories: { nodes: [{ id: 0, name: "Default", order: 0 }, ...categories] } };
    else if (name === "UpdateCategoryOrder") { moves.push(variables.input); if (!options.rejectOrder) { const index = categories.findIndex((item) => item.id === variables.input.id); const [item] = categories.splice(index, 1); categories.splice(variables.input.position - 1, 0, item); categories.forEach((item, index) => item.order = index + 1); } data = { updateCategoryOrder: { categories } }; }
    else { const method = (mockSdk as unknown as Record<string, (value: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  return { samples, moves, categories };
}
test("statistics use the entire library and keep server and device counts separate", async ({ page }) => {
  await fixture(page); await page.goto("/statistics"); const grid = page.locator("dl");
  await expect(grid.locator("div").filter({ has: page.locator("dt", { hasText: "Chapters read" }) }).locator("dd")).toHaveText("80");
  await expect(grid.locator("div").filter({ has: page.locator("dt", { hasText: "Saved on the server" }) }).locator("dd")).toHaveText("3");
  await expect(grid.locator("div").filter({ has: page.locator("dt", { hasText: "Saved on this device" }) }).locator("dd")).toHaveText("0");
  await expect(page.getByText("Reading time and comparable tracker ratings aren’t supplied by this library.", { exact: false })).toBeVisible();
});
test("calendar estimates are selectable, filterable and exclude completed publications", async ({ page }) => {
  const data = await fixture(page); await page.goto("/upcoming"); const day = page.getByRole("button", { name: /Thursday, October 15, 2026, 1 estimated releases/ });
  await day.click(); await expect(day).toHaveAttribute("aria-pressed", "true"); await expect(page.getByRole("link", { name: /Weekly Lantern Estimated/ })).toBeVisible(); expect(data.samples).toEqual([10001]);
  await page.getByText("Filter collections", { exact: true }).click(); await page.getByRole("button", { name: "Reading: any", exact: true }).click(); await page.getByRole("button", { name: "Reading: include", exact: true }).click();
  await expect(page.getByText(/0 of 0 eligible books checked/)).toBeVisible(); await expect(page.getByRole("link", { name: /Weekly Lantern Estimated/ })).toHaveCount(0);
});
test("an incomplete library never becomes a false statistics total", async ({ page }) => {
  await fixture(page, { incomplete: true }); await page.goto("/statistics"); await expect(page.getByRole("alert")).toContainText("complete library couldn’t be loaded"); await expect(page.locator("dl")).toHaveCount(0);
});
test("updates show partial progress and truthful server availability", async ({ page }) => {
  await fixture(page); await page.goto("/updates"); await expect(page.getByText("Page 4 of 20", { exact: true })).toBeVisible(); await expect(page.getByText("On server", { exact: true })).toBeVisible(); await expect(page.getByText("On this device", { exact: true })).toHaveCount(0);
});
test("category order has keyboard accessible controls and confirmed backend positions", async ({ page }) => {
  const data = await fixture(page); await page.goto("/library"); await page.getByRole("button", { name: "Manage Categories", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "Manage Categories" }); await expect(manager.getByRole("button", { name: "Move Reading up", exact: true })).toBeDisabled();
  await manager.getByRole("button", { name: "Move Favorites up", exact: true }).click(); await expect(manager.getByRole("button", { name: "Move Favorites up", exact: true })).toBeDisabled(); expect(data.moves).toEqual([{ id: 2, position: 1 }]);
  await expect(manager.getByRole("button", { name: "Delete category Default", exact: true })).toHaveCount(0);
});
test("a rejected category reorder leaves the saved order intact", async ({ page }) => {
  await fixture(page, { rejectOrder: true }); await page.goto("/library"); await page.getByRole("button", { name: "Manage Categories", exact: true }).click(); await page.getByRole("button", { name: "Move Favorites up", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("order wasn’t confirmed"); await expect(page.getByRole("button", { name: "Move Reading up", exact: true })).toBeDisabled();
});
for (const light of [false, true]) test(`insights remain accessible in ${light ? "light" : "dark"} mode`, async ({ page }) => {
  await fixture(page, { light }); await page.goto("/upcoming"); await expect(page.getByText(/1 of 1 eligible books checked/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await page.setViewportSize({ width: 430, height: 932 });
  expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  const navigation = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  await expect(navigation.getByRole("link")).toHaveCount(7);
  await navigation.getByRole("link", { name: "Statistics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your reading, in perspective.", exact: true })).toBeVisible();
  expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-label="Mobile navigation"]').analyze()).violations).toEqual([]);
});
