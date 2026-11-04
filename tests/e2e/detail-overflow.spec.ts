import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

const title = `${"The Extraordinary Adventures of a Reader in Another World ".repeat(5)}WithAnUnexpectedlyLongUnbrokenSubtitleThatStillNeedsToFitInsideTheWindow`;
const backend = "http://127.0.0.1:45675";
const picture = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#31574e"/></svg>';

async function fixture(page: Page) {
  await page.addInitScript(({ backend }) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, serverBaseUrl: backend, connectionStatus: "connected", autoDownloadCount: 0, themeMode: "light", colorPalette: "moonstone" } })), { backend });
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const operation = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (operation === "GetMangaDetails") {
      const base = await mockSdk.GetMangaDetails({ id: 10001 });
      data = { manga: { ...base.manga, id: 42, initialized: true, title, thumbnailUrl: "/covers/long-title.svg", realUrl: "https://source.example/series/long-title", author: "A Writer", artist: "An Artist", description: "A reader should be able to move vertically through this comic without moving the entire application sideways.", source: { name: "Fixture source" }, chapters: { nodes: [{ id: 101, name: "Chapter 1", chapterNumber: 1, sourceOrder: 1, isRead: false, lastPageRead: 0, pageCount: 2, isBookmarked: false, isDownloaded: false, uploadDate: "2026-11-03", scanlator: "Fixture" }] } } };
    } else if (operation === "FetchChapters") {
      data = { fetchChapters: { chapters: [{ id: 101, name: "Chapter 1", chapterNumber: 1, sourceOrder: 1, isRead: false, lastPageRead: 0, pageCount: 2, isBookmarked: false, isDownloaded: false, uploadDate: "2026-11-03", scanlator: "Fixture" }] } };
    } else {
      const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[operation];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  await page.route(`${backend}/covers/long-title.svg`, (route) => route.fulfill({ contentType: "image/svg+xml", body: picture }));
  await page.goto("/manga/42");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".yomi-manga-cover img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(400);
}

for (const width of [1100, 390]) {
  test(`comic details stay inside the app after horizontal wheel and cover drag at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await fixture(page);
    const main = page.locator(".yomi-main");
    const toolbar = page.locator(".yomi-book-toolbar");
    const heading = page.getByRole("heading", { name: title, exact: true });
    const dimensions = () => page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      scrollX,
      main: document.querySelector<HTMLElement>(".yomi-main")!.scrollWidth,
      mainWidth: document.querySelector<HTMLElement>(".yomi-main")!.clientWidth,
    }));
    await expect.poll(async () => { const size = await dimensions(); return Math.max(size.document, size.body) - size.viewport; }).toBeLessThanOrEqual(1);
    await expect.poll(async () => { const size = await dimensions(); return size.main - size.mainWidth; }).toBeLessThanOrEqual(1);
    expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (width >= 1024) {
      const sidebar = (await page.locator(".yomi-sidebar").boundingBox())!;
      expect((await toolbar.boundingBox())!.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width - 1);
    }

    const cover = (await page.locator(".yomi-manga-cover").boundingBox())!;
    const x = cover.x + cover.width / 2, y = cover.y + Math.min(cover.height / 2, 120);
    await page.mouse.move(x, y);
    await page.mouse.wheel(1800, 0);
    await page.mouse.down(); await page.mouse.move(Math.max(1, x - width), y, { steps: 12 }); await page.mouse.up();
    await page.mouse.move(x, y);
    await page.mouse.down(); await page.mouse.move(Math.min(width - 1, x + width), y, { steps: 12 }); await page.mouse.up();
    const size = await dimensions();
    expect(size.scrollX).toBe(0);
    expect(Math.max(size.document, size.body)).toBeLessThanOrEqual(width + 1);
    expect(size.main).toBeLessThanOrEqual(size.mainWidth + 1);
    expect((await toolbar.boundingBox())!.x).toBeGreaterThanOrEqual(width >= 1024 ? 215 : 0);
    expect((await toolbar.boundingBox())!.x + (await toolbar.boundingBox())!.width).toBeLessThanOrEqual(width + 1);

    await page.mouse.move(width - 45, 420); await page.mouse.wheel(0, 800);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollX)).toBe(0);
    await expect(page.getByRole("button", { name: "Refresh book and chapters", exact: true })).toBeVisible();
    await page.screenshot({ path: `.cache/reader-release-review/detail-overflow-light-${width}.png` });
  });
}
