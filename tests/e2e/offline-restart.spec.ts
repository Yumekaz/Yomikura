import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";

const backend = "http://127.0.0.1:45679";
const chapterName = "Offline restart chapter";
const mangaTitle = "Offline restart fixture";

async function failBackendRequests(context: BrowserContext) {
  await context.route("**/api/graphql", (route) => route.abort("connectionrefused"));
  await context.route(`${backend}/**`, (route) => route.abort("connectionrefused"));
}

test("device-cached reading survives a browser restart with an unavailable backend", async ({ baseURL }, testInfo) => {
  test.setTimeout(60_000);
  // Chrome's on-disk CacheStorage paths need room below Windows path limits.
  const profileRoot = join(process.cwd(), ".cache");
  await mkdir(profileRoot, { recursive: true });
  const profile = await mkdtemp(join(profileRoot, "pw-offline-"));
  const options = {
    ...testInfo.project.use.launchOptions,
    headless: true,
    baseURL,
    // This tests device cache access with the app shell available. PWA shell
    // navigation while completely offline has its own acceptance contract.
    serviceWorkers: "block" as const,
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    await context.addInitScript(({ backend }) => {
      if (!localStorage.getItem("yomikura-settings")) {
        localStorage.setItem("yomikura-settings", JSON.stringify({ state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "disconnected" }, version: 0 }));
      }
    }, { backend });
    await failBackendRequests(context);
    const page = await context.newPage();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.evaluate(async ({ backend, chapterName, mangaTitle }) => {
      const persisted = JSON.parse(localStorage.getItem("yomikura-settings") || "{}");
      localStorage.setItem("yomikura-settings", JSON.stringify({
        ...persisted,
        state: {
          ...persisted.state,
          serverBaseUrl: backend,
          mockMode: false,
          connectionStatus: "disconnected",
          readerMode: "LTR",
          pageSpread: "SINGLE",
          autoDownloadCount: 0,
          autoDeleteReadChapters: false,
        },
      }));

      const urls = [0, 1].map((index) => `${backend}/api/v1/manga/42/chapter/0/page/${index}`);
      const cache = await caches.open("yomikura-page-cache");
      for (const url of urls) {
        await cache.put(url, new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#264653"/></svg>',
          { headers: { "Content-Type": "image/svg+xml" } },
        ));
      }

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("yomikura-offline", 4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
          const db = request.result;
          const chapters = db.createObjectStore("chapters", { keyPath: "cacheKey" });
          chapters.createIndex("serverBaseUrl", "serverBaseUrl");
          chapters.createIndex("id", "id");
          chapters.createIndex("mangaId", "mangaId");
          const history = db.createObjectStore("reading-history", { keyPath: "historyKey" });
          history.createIndex("serverBaseUrl", "serverBaseUrl");
          history.createIndex("readAt", "readAt");
          history.createIndex("mangaId", "mangaId");
          const jobs = db.createObjectStore("download-jobs", { keyPath: "jobKey" });
          jobs.createIndex("serverBaseUrl", "serverBaseUrl");
          jobs.createIndex("updatedAt", "updatedAt");
        };
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction("chapters", "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.objectStore("chapters").put({
            cacheKey: `${backend}::12`, serverBaseUrl: backend, id: 12,
            name: chapterName, chapterNumber: 1, mangaId: 42, mangaTitle,
            sourceOrder: 0, pageCount: urls.length, pages: urls, cachedUrls: urls,
            totalSizeBytes: 512, cachedAt: Date.now(), lastPageRead: 0, isRead: false,
          });
        });
      } finally {
        db.close();
      }
    }, { backend, chapterName, mangaTitle });

    // Closing and relaunching Chrome proves the bytes survive beyond one tab
    // or an in-memory query cache. Use a dedicated test profile only.
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await failBackendRequests(context);
    const restartedPage = await context.newPage();
    await restartedPage.goto("/reader/12");
    await expect(restartedPage.getByText(chapterName, { exact: true })).toBeVisible();
    const image = restartedPage.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true });
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(320);
    await expect(image).toHaveAttribute("src", /^blob:/);
    await expect(image).toBeInViewport();
    await expect(image).toHaveCSS("opacity", "1");
    const preview = restartedPage.getByRole("button", { name: "Go to page 1", exact: true }).getByRole("img");
    await expect.poll(() => preview.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(320);
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await expect(restartedPage.getByRole("button", { name: "Explore Demo Library" })).toHaveCount(0);
    await restartedPage.screenshot({ path: testInfo.outputPath("offline-reader-after-restart.png") });

    await restartedPage.goto("/downloads");
    await expect(restartedPage.getByText(mangaTitle, { exact: true })).toBeVisible();
    await restartedPage.getByRole("link", { name: "Read", exact: true }).click();
    await expect(restartedPage.getByText(chapterName, { exact: true })).toBeVisible();

    await restartedPage.goto("/library");
    await expect(restartedPage.locator(".yomi-bookshelf").getByRole("link", { name: mangaTitle, exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await context.close();
  }
});
