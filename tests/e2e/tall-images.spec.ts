import { expect, test, type Page } from "@playwright/test";
test.use({ serviceWorkers: "block" });
const chapterName = "Chapter 1: The Journey Begins";
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const open = indexedDB.open("yomikura-offline", 4); const db = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    try { return await new Promise<{ pageCount: number; isRead?: boolean; cachedUrls: string[]; pageTiles?: { index: number; width: number; height: number; tiles: { url: string; height: number }[] }[] }>((resolve) => { const request = db.transaction("chapters").objectStore("chapters").get("demo::http://127.0.0.1:4567::20001"); request.onsuccess = () => resolve(request.result); }); } finally { db.close(); }
  });
}
async function fixture(page: Page) {
  await page.addInitScript(() => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:4567", mockMode: true, readerMode: "WEBTOON", connectionStatus: "connected", infiniteChapterReading: false, autoDeleteReadChapters: false, autoDownloadCount: 0, experience: { reader: { showReadingMode: false } } } })); });
  await page.goto("/settings/offline");
  const data = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 12000; const context = canvas.getContext("2d")!; for (let index = 0; index < 12; index++) { context.fillStyle = index % 2 ? "#31574e" : "#9d3d30"; context.fillRect(0, index * 1000, 400, 1000); } return canvas.toDataURL("image/png").split(",")[1]; });
  await page.route("**/demo/paper-garden-page.webp", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(data, "base64") }));
  await page.goto("/manga/10001"); await page.getByRole("button", { name: `Save ${chapterName} for offline reading`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove offline download of ${chapterName}`, exact: true })).toBeVisible();
  const saved = await snapshot(page); expect(saved.pageCount).toBe(2); expect(saved.pageTiles).toHaveLength(1); expect(saved.pageTiles![0]).toMatchObject({ index: 1, width: 400, height: 12000 }); expect(saved.pageTiles![0].tiles).toHaveLength(3);
  return saved;
}
test("tall device pages render as lossless tiles with stable restoration and canonical page counts", async ({ page }) => {
  await fixture(page); await page.goto("/reader/20001");
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  const tiles = page.locator('[data-reader-tile-layout="ready"]'); await expect(tiles).toHaveAttribute("data-tile-count", "3");
  await expect.poll(() => tiles.locator("img").first().evaluate((image) => (image as HTMLImageElement).naturalHeight)).toBe(4000);
  await expect(page.getByText("2 of 2 pages", { exact: true })).toBeVisible();
  expect((await snapshot(page)).isRead).toBe(false);
  const wrapper = page.locator('[data-reader-chapter="20001"][data-reader-page="1"]'); const height = (await wrapper.boundingBox())!.height;
  await page.reload(); await expect(tiles).toHaveAttribute("data-tile-count", "3");
  await expect.poll(async () => Math.abs((await wrapper.boundingBox())!.height - height)).toBeLessThan(2);
  await expect(page.getByText("2 of 2 pages", { exact: true })).toBeVisible(); expect((await snapshot(page)).isRead).toBe(false);
  await page.mouse.wheel(0, 40000); await expect.poll(async () => (await snapshot(page)).isRead).toBe(true);
});
test("a missing tile falls back to the complete original and downloads still own all their bytes", async ({ page }) => {
  const saved = await fixture(page), manifest = saved.pageTiles![0];
  await page.evaluate(async (url) => { await (await caches.open("yomikura-page-cache")).delete(url); }, manifest.tiles[1].url);
  await page.goto("/reader/20001"); await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(page.locator('[data-reader-tile-layout="ready"]')).toHaveCount(0);
  const original = page.getByRole("region", { name: "Reading surface", exact: true }).getByRole("img", { name: "Page 2", exact: true });
  await expect(original).toHaveCSS("opacity", "1");
  await expect.poll(() => original.evaluate((image) => (image as HTMLImageElement).naturalHeight)).toBe(12000);
  expect((await snapshot(page)).isRead).toBe(false);
});
