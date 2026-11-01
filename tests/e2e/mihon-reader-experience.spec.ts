import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";
import type { ReaderExperience } from "../../src/stores/readerExperience";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const backend = "http://127.0.0.1:45679";
async function fixture(page: Page, options: { mode?: string; wide?: boolean; crop?: boolean; count?: number; reader?: Partial<ReaderExperience> } = {}) {
  const count = options.count ?? 3;
  const chapter = { id: 12, name: "Chapter 1", chapterNumber: 1, sourceOrder: 1, mangaId: 10002, isRead: false, isBookmarked: false, lastPageRead: 0, pageCount: count, scanlator: "A" };
  const writes: { isRead?: boolean; lastPageRead?: number }[] = [];
  await page.addInitScript(({ backend, options }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, readerMode: options.mode ?? "LTR", fitMode: "FIT_SCREEN", pageSpread: "SINGLE", connectionStatus: "connected", infiniteChapterReading: false, autoDownloadCount: 0, cropBorders: options.crop ?? false, experience: { reader: { showReadingMode: false, ...options.reader } } } }));
  }, { backend, options });
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetChapter") data = { chapter: { ...chapter, manga: { title: "Reader experience fixture" } } };
    else if (name === "GetReadingChapters") data = chapterConnection(10002, [chapter, { ...chapter, id: 13, chapterNumber: 2, name: "Chapter 2", sourceOrder: 2 }]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: Array.from({ length: count }, (_, index) => `${backend}/api/v1/manga/10002/chapter/1/page/${index}`) } };
    else if (name === "UpdateChapterProgress") { writes.push(variables.input.patch); Object.assign(chapter, variables.input.patch); data = { updateChapter: { chapter } }; }
    else { const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  const width = options.wide ? 1200 : 600, height = options.wide ? 800 : 900;
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="40" y="50" width="${width - 80}" height="${height - 100}" fill="#264653"/></svg>`;
  await page.route("**/api/v1/manga/*/chapter/*/page/*", (route) => route.fulfill({ contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: image }));
  return { chapter, writes };
}
const images = (page: Page) => page.locator('[id^="reader-page-"]');

test("chapter exports preserve image bytes and page order without advancing reading progress", async ({ page }) => {
  const state = await fixture(page); await page.goto("/reader/12");
  await expect(images(page).getByRole("img", { name: "Page 1", exact: true })).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Page actions", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "Export chapter as CBZ", exact: true }).click();
  const file = await download; expect(file.suggestedFilename()).toBe("Reader experience fixture - Chapter 1.cbz");
  const bytes = await readFile((await file.path())!); let offset = 0;
  for (let index = 1; index <= 3; index++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x04034b50); const nameLength = bytes.readUInt16LE(offset + 26), length = bytes.readUInt32LE(offset + 18);
    expect(bytes.subarray(offset + 30, offset + 30 + nameLength).toString()).toBe(`${String(index).padStart(4, "0")}.svg`);
    expect(bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + length).toString()).toContain('fill="#264653"');
    offset += 30 + nameLength + length;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50); expect(state.chapter.isRead).toBe(false); expect(state.chapter.lastPageRead).toBe(0);
});

test("cancelling a chapter export leaves no download and preserves the reader position", async ({ page }) => {
  const state = await fixture(page); let release!: () => void, entered = false;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/manga/10002/chapter/1/page/1", async (route) => { if (route.request().resourceType() === "fetch") { entered = true; await wait; } await route.fallback(); });
  await page.goto("/reader/12"); await expect(images(page).getByRole("img", { name: "Page 1", exact: true })).toHaveCSS("opacity", "1");
  let downloads = 0; page.on("download", () => downloads++);
  try {
    await page.getByRole("button", { name: "Page actions", exact: true }).click(); await page.getByRole("menuitem", { name: "Export chapter as CBZ", exact: true }).click();
    await expect.poll(() => entered).toBe(true); await page.getByRole("menuitem", { name: "Cancel export", exact: true }).click();
    await expect(page.getByText("Export cancelled.", { exact: true })).toBeVisible();
    expect(downloads).toBe(0); expect(state.chapter.isRead).toBe(false); expect(state.chapter.lastPageRead).toBe(0);
  } finally { release(); }
});
test("paper background and persistent page numbers follow actual navigation", async ({ page }) => {
  await fixture(page, { reader: { background: "paper", showPageNumber: true, doubleTapZoom: false } }); await page.goto("/reader/12");
  await expect(images(page).getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  await expect(page.locator("[data-reader-session]")).toHaveCSS("background-color", "rgb(244, 236, 220)");
  const surface = page.getByRole("region", { name: "Reading surface", exact: true });
  await surface.click({ position: { x: 450, y: 300 } });
  await expect(page.getByLabel("Reading position", { exact: true })).toHaveText("1 / 3");
  await surface.press("ArrowRight"); await expect(page.getByLabel("Reading position", { exact: true })).toHaveText("2 / 3");
});
test("a split landscape spread completes only after its second half", async ({ page }) => {
  const state = await fixture(page, { wide: true, count: 1, reader: { widePages: "split", doubleTapZoom: false } }); await page.goto("/reader/12");
  await expect(images(page)).toHaveAttribute("data-reader-half", "0"); await expect.poll(() => state.writes.length).toBeGreaterThan(0); expect(state.writes.some((patch) => patch.isRead)).toBe(false);
  await page.getByRole("region", { name: "Reading surface" }).press("ArrowRight");
  await expect(images(page)).toHaveAttribute("data-reader-half", "1"); await expect.poll(() => state.chapter.isRead).toBe(true);
  await page.getByRole("region", { name: "Reading surface" }).press("ArrowLeft"); await expect(images(page)).toHaveAttribute("data-reader-half", "0"); expect(state.chapter.isRead).toBe(true);
});
test("vertical split spreads retain both halves and wait for the end of the final image", async ({ page }) => {
  const state = await fixture(page, { mode: "WEBTOON", wide: true, count: 1, reader: { wideWebtoon: "split" } }); await page.goto("/reader/12");
  await expect(images(page)).toHaveCount(2);
  await expect.poll(() => images(page).locator("img").evaluateAll((nodes) => nodes.every((node) => (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect.poll(() => state.writes.length).toBeGreaterThan(0); expect(state.writes.some((patch) => patch.isRead)).toBe(false);
  await page.mouse.wheel(0, 2600); await expect.poll(() => state.chapter.isRead).toBe(true);
});
test("border cropping detects the actual blank strips and zoom/pan preserves navigation", async ({ page }) => {
  await fixture(page, { crop: true }); await page.goto("/reader/12");
  await expect(images(page)).toHaveAttribute("data-border-crop", "checked");
  const image = images(page).getByRole("img", { name: "Page 1", exact: true });
  expect(Number.parseFloat(await image.evaluate((node) => (node as HTMLElement).style.left))).toBeLessThan(0);
  await image.dblclick(); await expect(images(page)).toHaveAttribute("data-image-zoom", "2.00");
  const bounds = (await images(page).boundingBox())!; const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 80, y - 70, { steps: 8 }); await page.mouse.up();
  await expect(page).toHaveURL(/\/reader\/12$/); await page.getByRole("button", { name: "Fit page", exact: true }).click(); await expect(images(page)).toHaveAttribute("data-image-zoom", "1.00");
});
test("fullscreen can be entered and is restored when leaving the reader", async ({ page }) => {
  await fixture(page); await page.goto("/reader/12"); await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole("link", { name: "Back to manga details", exact: true }).click(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
test("page tools save the original decoded image with a meaningful filename", async ({ page }) => {
  await fixture(page); await page.goto("/reader/12"); await page.getByRole("button", { name: "Page actions", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "Save page", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Reader experience fixture - Page 1.svg");
});
test("a chapter pause holds the boundary until the reader explicitly continues", async ({ page }) => {
  await fixture(page, { count: 1, reader: { pauseBetweenChapters: true } }); await page.goto("/reader/12"); await expect(images(page).getByRole("img", { name: "Page 1", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Reading surface" }).press("ArrowRight"); await expect(page.getByRole("region", { name: "Chapter transition" })).toBeVisible(); await expect(page).toHaveURL(/\/reader\/12$/);
  await page.getByRole("button", { name: "Continue reading", exact: true }).click(); await expect(page).toHaveURL(/\/reader\/13$/);
});
test("the vertical navigator has independent keyboard focus and reflects real page jumps", async ({ page }) => {
  await fixture(page, { reader: { verticalNavigator: true, navigatorLeft: true } }); await page.goto("/reader/12");
  const navigator = page.getByRole("slider", { name: "Vertical page navigator", exact: true }); await navigator.focus(); await navigator.press("End");
  await expect(navigator).toHaveValue("2"); await expect(images(page).getByRole("img", { name: "Page 3", exact: true })).toBeVisible();
});
test("two touch taps zoom the page and the fit control restores its reading position", async ({ page, context }) => {
  await fixture(page, { reader: { doubleTapZoom: true } }); await page.goto("/reader/12");
  await expect(images(page).getByRole("img", { name: "Page 1", exact: true })).toHaveCSS("opacity", "1");
  const box = await images(page).boundingBox(); if (!box) throw new Error("Reading image is unavailable");
  const input = await context.newCDPSession(page), point = { x: box.x + box.width / 2, y: Math.min(box.y + box.height / 2, 500), id: 1 };
  for (let index = 0; index < 2; index++) { await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] }); await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  await expect(images(page)).toHaveAttribute("data-image-zoom", "2.00"); await page.getByRole("button", { name: "Fit page", exact: true }).click(); await expect(images(page)).toHaveAttribute("data-image-zoom", "1.00"); await expect(page).toHaveURL(/\/reader\/12$/);
});
test("reader preferences persist through reload with themed controls in light and dark modes", async ({ page }) => {
  await fixture(page); await page.goto("/settings/reader");
  await page.getByRole("combobox", { name: "Reader background", exact: true }).click(); await page.getByRole("option", { name: "Warm paper", exact: true }).click();
  await page.getByRole("checkbox", { name: "Skip duplicate chapter editions", exact: true }).check();
  await page.getByRole("combobox", { name: "Wide pages in vertical reading", exact: true }).click(); await page.getByRole("option", { name: "Stack the two halves", exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.experience.reader);
  expect(saved).toMatchObject({ background: "paper", skipDuplicates: true, wideWebtoon: "split" });
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Reader background", exact: true })).toContainText("Warm paper");
  await expect(page.getByRole("checkbox", { name: "Skip duplicate chapter editions", exact: true })).toBeChecked();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Appearance", exact: true }).click(); await page.getByRole("button", { name: "Light", exact: true }).click(); await page.getByRole("button", { name: "Reader", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Reader background", exact: true })).toContainText("Warm paper");
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
test("screen wake requests are not duplicated by focus and are released on reader exit", async ({ page }) => {
  await fixture(page, { reader: { keepAwake: true } });
  await page.addInitScript(() => {
    const counts = { requests: 0, releases: 0 }; Object.assign(window, { parityWakeCounts: counts });
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => { counts.requests++; const sentinel = { released: false, release: async () => { sentinel.released = true; counts.releases++; } }; return sentinel; } } });
  });
  await page.goto("/reader/12");
  await expect.poll(() => page.evaluate(() => { const counts = (window as any).parityWakeCounts; return counts.requests - counts.releases; })).toBe(1);
  const beforeFocus = await page.evaluate(() => (window as any).parityWakeCounts.requests);
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); });
  expect(await page.evaluate(() => (window as any).parityWakeCounts.requests)).toBe(beforeFocus);
  await page.getByRole("link", { name: "Back to manga details", exact: true }).click();
  await expect.poll(() => page.evaluate(() => { const counts = (window as any).parityWakeCounts; return counts.requests - counts.releases; })).toBe(0);
});
