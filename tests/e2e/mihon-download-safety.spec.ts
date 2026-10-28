import { expect, test } from "@playwright/test";

test("an HTTP-success error page is never retained as a complete offline chapter", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:4567", mockMode: true, connectionStatus: "connected", autoDeleteReadChapters: false, autoDownloadCount: 0 } })));
  let broken = true;
  await page.route("**/demo/paper-garden-page.webp", (route) => route.fulfill(broken
    ? { status: 200, contentType: "image/webp", body: "<html>Temporary source error</html>" }
    : { contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#31574e"/></svg>' }));
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
  broken = false; await page.getByRole("button", { name: "Retry download of Chapter 1: The Journey Begins", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove offline download of Chapter 1: The Journey Begins", exact: true })).toBeVisible();
  expect(await stored()).toBe(1);
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
