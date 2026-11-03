import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";
const backend = "http://127.0.0.1:45679";
async function prepare(page: Page, mode: string) {
  const chapter = { id: 12, name: "Chapter 1", chapterNumber: 1, sourceOrder: 1, mangaId: 10002, isRead: false, isBookmarked: false, lastPageRead: 0, pageCount: 5 };
  await page.addInitScript(({ backend, mode }) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, readerMode: mode, fitMode: "FIT_SCREEN", pageSpread: "SINGLE", connectionStatus: "connected", infiniteChapterReading: false, autoDownloadCount: 0, autoDeleteReadChapters: false, pageTransition: "none", experience: { reader: { showReadingMode: false, zoomAnimationMs: 0 } } } })), { backend, mode });
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetChapter") data = { chapter: { ...chapter, manga: { title: "Shared zoom fixture" } } };
    else if (name === "GetReadingChapters") data = chapterConnection(10002, [chapter]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: Array.from({ length: 5 }, (_, i) => `${backend}/api/v1/manga/10002/chapter/1/page/${i}`) } };
    else if (name === "UpdateChapterProgress") { Object.assign(chapter, variables.input.patch); data = { updateChapter: { chapter } }; }
    else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/manga/*/chapter/*/page/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#264653"/></svg>' }));
  await page.goto("/reader/12");
  await expect(page.locator('[id^="reader-page-"]').first().getByRole("img", { name: "Page 1", exact: true })).toHaveCSS("opacity", "1");
  return chapter;
}
const pages = (page: Page) => page.locator('[id^="reader-page-"]');
async function allAt(page: Page, value: string) { await expect.poll(() => pages(page).evaluateAll((nodes) => nodes.length > 0 && nodes.every((node) => node.getAttribute("data-image-zoom") === value))).toBe(true); }

test("webtoon zoom applies to the strip, preserves its cursor and resets both magnification directions", async ({ page }) => {
  const chapter = await prepare(page, "WEBTOON");
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(page.getByText("2 of 5 pages", { exact: true })).toBeVisible();
  const height = await pages(page).nth(1).locator(".yomi-reader-image-viewport").evaluate((node) => node.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click(); await allAt(page, "1.20");
  await expect.poll(() => pages(page).nth(1).locator(".yomi-reader-image-viewport").evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(height);
  await expect(page.getByText("2 of 5 pages", { exact: true })).toBeVisible(); expect(chapter.isRead).toBe(false);
  await page.getByRole("button", { name: "Go to page 4", exact: true }).click();
  await expect(pages(page).getByRole("img", { name: "Page 4", exact: true })).toHaveCSS("opacity", "1"); await allAt(page, "1.20");
  await pages(page).getByRole("img", { name: "Page 4", exact: true }).dblclick(); await allAt(page, "1.00");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click(); await allAt(page, "0.83");
  await pages(page).getByRole("img", { name: "Page 4", exact: true }).dblclick(); await allAt(page, "1.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("paged zoom survives page navigation, wheel zoom and pan stay inside the reader", async ({ page }) => {
  await prepare(page, "LTR");
  await pages(page).getByRole("img", { name: "Page 1", exact: true }).dblclick(); await allAt(page, "2.00");
  await page.getByRole("region", { name: "Reading surface", exact: true }).press("ArrowRight");
  await expect(pages(page).getByRole("img", { name: "Page 2", exact: true })).toHaveCSS("opacity", "1"); await allAt(page, "2.00");
  const box = (await pages(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * 1.6, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0)).toBe(true);
  await page.getByRole("button", { name: "Reset reader zoom", exact: true }).click(); await allAt(page, "1.00");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down("Control"); await page.mouse.wheel(0, -200); await page.keyboard.up("Control");
  await expect.poll(() => pages(page).first().getAttribute("data-image-zoom")).not.toBe("1.00");
  await page.getByRole("button", { name: "Reset reader zoom", exact: true }).click(); await allAt(page, "1.00");
});

test("touch pinch changes every page and a double tap resets the strip", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, viewport: { width: 430, height: 850 } });
  try {
    const page = await context.newPage(); await prepare(page, "WEBTOON");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 130, y: 300 }, { x: 230, y: 300 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 80, y: 300 }, { x: 280, y: 300 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => pages(page).first().getAttribute("data-image-zoom")).not.toBe("1.00");
    await page.touchscreen.tap(180, 300); await page.touchscreen.tap(180, 300); await allAt(page, "1.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
