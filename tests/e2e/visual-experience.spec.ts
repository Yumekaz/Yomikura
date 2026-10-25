import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { mockSdk } from "../../src/api/graphql/mockSdk";

const backend = "http://127.0.0.1:45677";
const evidence = ".cache/visual-upgrade-2026-10-24/screens";
async function libraryFixture(page: Page, count: number, baseURL: string, theme = "dark") {
  await page.addInitScript(({ backend, theme }) => {
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, themeMode: theme, connectionStatus: "connected", profiles: [{ id: "visual", name: "Reading room", url: backend }], activeProfileId: "visual" } }));
  }, { backend, theme });
  const books = Array.from({ length: count }, (_, index) => ({ id: index + 1, title: `Book ${String(index + 1).padStart(3, "0")}`, thumbnailUrl: `${baseURL}/demo/${index % 2 ? "paper-garden" : "moonlit-courier"}.webp`, unreadCount: index % 4, downloadCount: 0, lastReadChapter: null, categories: { nodes: [] } }));
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    let data: unknown;
    if (name === "GetLibrary") data = { mangas: { nodes: books, pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (name === "GetHistory") data = { chapters: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
    else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  if (count) await expect(page.getByRole("link", { name: "Book 001", exact: true })).toBeVisible();
  await mkdir(evidence, { recursive: true });
}

for (const width of [1440, 1280, 1024, 768, 390]) {
  test(`book covers retain their proportions without overflow at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 1024 });
    await libraryFixture(page, 200, baseURL!);
    const geometry = await page.locator(".yomi-book-cover").evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    expect(geometry.length).toBeGreaterThan(2);
    for (const box of geometry) { expect(Math.abs(box.height / box.width - 1.5)).toBeLessThan(.01); expect(box.width).toBeGreaterThan(100); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${evidence}/library-200-${width}.png` });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole("link", { name: "Book 200", exact: true })).toBeVisible();
  });
}
for (const count of [0, 1, 20]) {
  test(`library composition with ${count} books`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await libraryFixture(page, count, baseURL!);
    if (!count) await expect(page.getByRole("link", { name: "Discover books", exact: true })).toBeVisible();
    await page.screenshot({ path: `${evidence}/library-${count}-1440.png` });
  });
}
test("search has a useful empty state and restores the collection", async ({ page, baseURL }) => {
  await libraryFixture(page, 20, baseURL!);
  await page.getByRole("searchbox", { name: "Search library" }).fill("No matching book");
  await expect(page.getByRole("heading", { name: "No books found", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("link", { name: "Book 001", exact: true })).toBeVisible();
});
test("keyboard access can continue beyond the virtualized rows", async ({ page, baseURL }) => {
  await libraryFixture(page, 200, baseURL!);
  await page.getByRole("link", { name: "Book 001", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Book 200", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Book 002", exact: true })).toBeFocused();
});
test("light theme and reduced motion retain the reading-room controls", async ({ page, baseURL }) => {
  await libraryFixture(page, 20, baseURL!, "light");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveClass(/light-theme/);
  const duration = await page.locator(".yomi-book-cover").first().evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration.split(",").every((item) => parseFloat(item) < .01)).toBe(true);
  await page.screenshot({ path: `${evidence}/library-light.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/library-light-mobile.png` });
});
test("all six destinations remain reachable on a narrow screen", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await libraryFixture(page, 1, baseURL!);
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const name of ["Library", "Discover", "Updates", "Downloads", "History", "Settings"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appearance and theme", exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-mobile.png` });
});
