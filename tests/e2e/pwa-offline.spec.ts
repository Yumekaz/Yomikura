import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const backend = "http://127.0.0.1:45679";
let server: Server, origin: string, revision = "first", failNewAsset = false;
test.beforeAll(async () => {
  const dist = resolve("dist");
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://localhost").pathname;
      if (pathname.startsWith("/api/")) { response.writeHead(503); response.end(); return; }
      if (failNewAsset && revision !== "first" && /ReaderPage.*\.js$/.test(pathname)) { response.writeHead(503); response.end(); return; }
      const file = resolve(dist, `.${pathname}`); if (file !== dist && !file.startsWith(`${dist}${sep}`)) { response.writeHead(403); response.end(); return; }
      const target = pathname === "/" || !extname(pathname) ? resolve(dist, "index.html") : file;
      let bytes = await readFile(target);
      if (pathname === "/sw.js") bytes = Buffer.from(bytes.toString().replace(/const BUILD_ID = "([^"]+)";/, `const BUILD_ID = "$1-${revision}";`));
      const type: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
      response.writeHead(200, { "content-type": type[extname(target)] ?? "application/octet-stream", "cache-control": "no-store" }); response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
test.beforeEach(() => { revision = "first"; failNewAsset = false; });
async function prepare(page: Page) {
  await page.addInitScript(({ backend }) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "disconnected", readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0, autoDeleteReadChapters: false } })); }, { backend });
  await page.goto(`${origin}/settings/offline`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async ({ backend }) => {
    const request = indexedDB.open("yomikura-offline", 4); const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const url = `${backend}/api/v1/manga/42/chapter/1/page/0`; const image = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31574e"/></svg>';
    await (await caches.open("yomikura-page-cache")).put(url, new Response(image, { headers: { "content-type": "image/svg+xml" } }));
    await (await caches.open("unrelated-fixture-cache")).put("/fixture", new Response("preserve"));
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("chapters", "readwrite"); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.objectStore("chapters").put({ cacheKey: `${backend}::12`, serverBaseUrl: backend, isDemo: false, id: 12, name: "Offline PWA chapter", chapterNumber: 1, mangaId: 42, mangaTitle: "Offline PWA fixture", sourceOrder: 1, pageCount: 1, pages: [url], cachedUrls: [url], totalSizeBytes: image.length, cachedAt: Date.now(), isRead: true, lastPageRead: 0 }); }); } finally { db.close(); }
  }, { backend });
}
test("a never-visited reader deep link and lazy settings route work with all browser networking offline", async ({ page, context }) => {
  await prepare(page); await context.setOffline(true);
  await page.goto(`${origin}/reader/12`);
  const image = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true });
  await expect(image).toHaveAttribute("src", /^blob:/, { timeout: 15000 }); await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(600);
  await page.goto(`${origin}/settings/reader`); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.goto(`${origin}/library`); await expect(page.getByText("Offline PWA fixture", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "On server", exact: true })).toBeDisabled();
  await context.setOffline(false);
});
test("incomplete shell updates leave the active generation and saved pages intact", async ({ page, context }) => {
  test.setTimeout(90000);
  await prepare(page);
  const oldName = await page.evaluate(async () => (await caches.keys()).find((key) => key.startsWith("yomikura-shell-"))!);
  revision = "second"; failNewAsset = true;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect.poll(() => page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())!.installing)).toBe(true);
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(false);
  await context.setOffline(true); await page.goto(`${origin}/settings/reader`); await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible(); await context.setOffline(false);
  expect(await page.evaluate(async (name) => (await caches.keys()).includes(name), oldName)).toBe(true);
  failNewAsset = false; await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true);
  await expect(page.getByText(/An app update is ready/)).toBeVisible();
  await page.close();
  const replacement = await context.newPage();
  await replacement.goto(`${origin}/settings/offline`, { waitUntil: "domcontentloaded", timeout: 15000 }); await replacement.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => replacement.evaluate(async () => (await caches.keys()).some((name) => name.startsWith("yomikura-shell-") && name.endsWith("-second")))).toBe(true);
  const names = await replacement.evaluate(() => caches.keys()); expect(names).toContain("yomikura-page-cache"); expect(names).toContain("unrelated-fixture-cache"); expect(names).not.toContain(oldName);
  await context.setOffline(true); await replacement.goto(`${origin}/reader/12`); await expect(replacement.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toHaveAttribute("src", /^blob:/, { timeout: 15000 });
});
test("switching offline inside the running app still queries device-backed routes", async ({ page, context }) => {
  await prepare(page); await context.setOffline(true);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("link", { name: "Offline PWA fixture", exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Reconnect to this server", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.serverBaseUrl)).toBe(backend);
  await page.getByRole("link", { name: "Offline PWA fixture", exact: true }).click();
  await page.getByRole("link", { name: "Resume", exact: true }).click();
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toHaveAttribute("src", /^blob:/, { timeout: 15000 });
});
