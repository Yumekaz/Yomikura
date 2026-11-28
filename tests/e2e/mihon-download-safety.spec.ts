import { chromium, expect, test } from "@playwright/test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
test.use({ serviceWorkers: "block" });

test("an HTTP-success error page is never retained as a complete offline chapter", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:4567", mockMode: true, connectionStatus: "connected", autoDeleteReadChapters: false, autoDownloadCount: 0 } })));
  let broken = true, corruptResponses = 0;
  await page.route("**/demo/paper-garden-page.webp", (route) => { if (broken) corruptResponses++; return route.fulfill(broken
    ? { status: 200, contentType: "image/webp", body: "<html>Temporary source error</html>" }
    : { contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#31574e"/></svg>' }); });
  await page.goto("/manga/10001");
  await page.getByRole("button", { name: "Save Chapter 1: The Journey Begins for offline reading", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry download of Chapter 1: The Journey Begins", exact: true })).toBeVisible();
  const stored = () => page.evaluate(async () => {
    const open = indexedDB.open("yomikura-offline", 4);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    try { return await new Promise<number>((resolve, reject) => { const request = db.transaction("chapters").objectStore("chapters").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
  expect(await stored()).toBe(0);
  expect(corruptResponses).toBeGreaterThan(0);
  broken = false; await page.getByRole("button", { name: "Retry download of Chapter 1: The Journey Begins", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove offline download of Chapter 1: The Journey Begins", exact: true })).toBeVisible();
  expect(await stored()).toBe(1);
});

test("relaunching the browser resumes an interrupted device chapter past the verified page", async ({ baseURL }, testInfo) => {
  test.setTimeout(60_000);
  const profileRoot = join(process.cwd(), ".cache");
  await mkdir(profileRoot, { recursive: true });
  const profile = await mkdtemp(join(profileRoot, "pw-dl-"));
  const options = { ...testInfo.project.use.launchOptions, baseURL, headless: true, serviceWorkers: "block" as const };
  const chapter = "Chapter 1: The Journey Begins";
  const unfinished = "**/demo/paper-garden-page.webp";
  let context = await chromium.launchPersistentContext(profile, options);
  let release!: () => void;
  const heldRequest = new Promise<void>((resolve) => { release = resolve; });
  try {
    await context.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:4567", mockMode: true, connectionStatus: "connected", autoDeleteReadChapters: false, autoDownloadCount: 0 } })));
    await context.route(unfinished, async (route) => {
      if (route.request().resourceType() !== "fetch") return route.continue();
      await heldRequest;
      await route.abort().catch(() => undefined);
    });
    const page = context.pages()[0];
    await page.goto("/manga/10001");
    const secondPage = page.waitForRequest((request) => request.resourceType() === "fetch" && request.url().endsWith("/demo/paper-garden-page.webp"));
    await page.getByRole("button", { name: `Save ${chapter} for offline reading`, exact: true }).click();
    await secondPage;
    const verified = await page.evaluate(async () => {
      const request = indexedDB.open("yomikura-offline", 4);
      const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try {
        const read = db.transaction("download-jobs").objectStore("download-jobs").getAll();
        const jobs = await new Promise<typeof read.result>((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
        const job = jobs.find((row) => row.chapterId === 20001);
        return { status: job?.status, url: job?.checkpoint?.pages[0]?.url as string | undefined };
      } finally { db.close(); }
    });
    expect(verified.status).toBe("downloading");
    expect(verified.url).toBeTruthy();
    await context.close();
    release();

    context = await chromium.launchPersistentContext(profile, options);
    const requests: string[] = [];
    await context.route(/\/demo\/paper-garden(?:-page)?\.webp$/, (route) => {
      if (route.request().resourceType() === "fetch") requests.push(new URL(route.request().url()).pathname);
      return route.continue();
    });
    const restarted = context.pages()[0];
    await restarted.goto("/manga/10001");
    await expect(restarted.getByRole("button", { name: `Remove offline download of ${chapter}`, exact: true })).toBeVisible();
    expect(requests).toEqual(["/demo/paper-garden-page.webp"]);
    expect(await restarted.evaluate(async (url) => !!await (await caches.open("yomikura-page-cache")).match(url), verified.url!)).toBe(true);
  } finally {
    release();
    await context.close();
  }
});

test("cleanup protection choices persist without inventing unavailable storage capacity", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:4567", mockMode: true, connectionStatus: "connected" } }));
    Object.defineProperty(navigator.storage, "estimate", { value: async () => ({ usage: 1024 }) });
  });
  await page.goto("/settings/offline");
  await page.getByRole("checkbox", { name: "Remove finished downloads automatically", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "Keep bookmarked chapters", exact: true })).toBeChecked();
  await page.getByRole("combobox", { name: "Keep recent completed chapters", exact: true }).click(); await page.getByRole("option", { name: "Keep 3", exact: true }).click();
  await page.getByRole("combobox", { name: "Wait before removing files", exact: true }).click(); await page.getByRole("option", { name: "24 hours", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Keep recent completed chapters", exact: true })).toContainText("Keep 3");
  await expect(page.getByRole("combobox", { name: "Wait before removing files", exact: true })).toContainText("24 hours");
  await expect(page.getByText("1 KB · Capacity unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Device storage used", exact: true })).toHaveCount(0);
});
