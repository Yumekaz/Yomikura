import { chooseOption } from "./fixtures/themedSelect";
import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { mockSdk } from "../../src/api/graphql/mockSdk";

const backend = "http://127.0.0.1:45679";
const archive = gzipSync("Synthetic library backup fixture");

async function connectFixture(context: BrowserContext, options: { offline?: boolean; failStorage?: boolean; restoreFails?: boolean } = {}) {
  const state = { restores: 0, safetyVerifiedBeforeRestore: false, exports: 0 };
  await context.addInitScript(({ backend, failStorage }) => {
    if (!localStorage.getItem("yomikura-settings")) {
      localStorage.setItem("yomikura-settings", JSON.stringify({ state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", backupIntervalHours: 0 }, version: 0 }));
    }
    if (failStorage) {
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, version) => {
        if (name === "yomikura-library-backups") throw new DOMException("Fixture device storage is full", "QuotaExceededError");
        return original(name, version);
      };
    }
  }, { backend, failStorage: !!options.failStorage });
  await context.route(`${backend}/**`, async (route) => {
    if (options.offline) return route.abort("connectionrefused");
    if (route.request().url().includes("/export/")) return route.fulfill({ contentType: "application/gzip", body: archive });
    if (new URL(route.request().url()).pathname !== "/api/graphql") return route.fulfill({ status: 404, body: "No fixture resource" });
    if (route.request().headers()["content-type"]?.startsWith("multipart/form-data")) {
      state.restores += 1;
      state.safetyVerifiedBeforeRestore = await route.request().frame().evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("yomikura-library-backups", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<boolean>((resolve, reject) => {
            const transaction = db.transaction("backups", "readonly");
            const request = transaction.objectStore("backups").getAll();
            request.onsuccess = () => resolve(request.result.some((item) => item.purpose === "safety" && item.verified && item.blob.size > 0));
            request.onerror = () => reject(request.error);
          });
        } finally { db.close(); }
      });
      return route.fulfill({ json: { data: { restoreBackup: { id: "restore-fixture", status: { state: "RESTORING_MANGA", mangaProgress: 0, totalManga: 1 } } } } });
    }
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "CreateBackup") {
      state.exports += 1;
      data = { createBackup: { url: `/export/temporary-${state.exports}.tachibk` } };
    } else if (name === "GetRestoreStatus") {
      data = { restoreStatus: { state: options.restoreFails ? "FAILURE" : "SUCCESS", mangaProgress: 1, totalManga: 1 } };
    } else {
      const method = (mockSdk as unknown as Record<string, (variables: unknown) => Promise<unknown>>)[name];
      if (!method) throw new Error(`Unhandled backup fixture operation: ${name}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  return state;
}

test("a retained backup survives Chrome restart and exports with the server unavailable", async ({ baseURL }, info) => {
  test.setTimeout(60_000);
  await mkdir(join(process.cwd(), ".cache"), { recursive: true });
  const profile = await mkdtemp(join(process.cwd(), ".cache", "bk-"));
  const options = { ...info.project.use.launchOptions, headless: true, baseURL, serviceWorkers: "block" as const };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    await connectFixture(context);
    let page = await context.newPage();
    await page.goto("/settings/backup");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Create & Download Backup", exact: true }).click();
    await (await download).saveAs(info.outputPath("initial-export.tachibk"));
    await expect(page.getByText("Backup saved and verified on this device.", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved backups" }).getByRole("listitem")).toHaveCount(1);
    await context.close();

    context = await chromium.launchPersistentContext(profile, options);
    await connectFixture(context, { offline: true });
    page = await context.newPage();
    await page.goto("/settings/backup");
    const saved = page.getByRole("region", { name: "Saved backups" });
    await expect(saved.getByRole("listitem")).toHaveCount(1);
    const retainedExport = page.waitForEvent("download");
    await saved.getByRole("button", { name: "Export", exact: true }).click();
    const path = info.outputPath("export-after-restart.tachibk");
    await (await retainedExport).saveAs(path);
    expect(await readFile(path)).toEqual(archive);
    await page.screenshot({ path: info.outputPath("saved-backup-after-restart.png") });

    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem("yomikura-settings")!);
      settings.state.serverBaseUrl = "http://127.0.0.1:45678";
      settings.state.profiles = [{ id: "other", name: "Other server", url: settings.state.serverBaseUrl }];
      settings.state.activeProfileId = "other";
      localStorage.setItem("yomikura-settings", JSON.stringify(settings));
    });
    await context.route("http://127.0.0.1:45678/**", (route) => route.abort());
    await page.reload();
    await expect(saved.getByText("No saved backups for this server.")).toBeVisible();
  } finally { await context.close(); }
});

test("a failed safety-copy write blocks restore and cannot report automatic backup success", async ({ context, page }) => {
  const state = await connectFixture(context, { failStorage: true });
  await page.goto("/settings/backup");
  await page.locator('input[type="file"][accept=".zip,.tachibk,.json"]').setInputFiles({ name: "fixture.tachibk", mimeType: "application/gzip", buffer: archive });
  await page.getByRole("button", { name: "Back up and restore", exact: true }).click();
  await expect(page.getByText(/Restore stopped because its safety backup could not be saved and verified/)).toBeVisible();
  expect(state.restores).toBe(0);
  await chooseOption(page.getByLabel("Automatic backup schedule"), "12");
  await expect(page.getByText(/Last attempt failed:/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.lastScheduledBackupAt)).toBe(0);
});

test("automatic backup uses a retained artifact and does not repeat after reload", async ({ context, page }) => {
  const state = await connectFixture(context);
  await page.goto("/settings/backup");
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("yomikura-settings")!);
    // A legacy success timestamp without a retained file must not postpone a real backup.
    settings.state = { ...settings.state, lastScheduledBackupAt: Date.now(), scheduledBackupStatus: "success", backupIntervalHours: 12 };
    localStorage.setItem("yomikura-settings", JSON.stringify(settings));
  });
  await page.reload();
  await expect(page.getByText(/Last automatic backup:/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved backups" }).getByText(/Automatic ·/)).toBeVisible();
  expect(state.exports).toBe(1);
  await page.reload();
  await expect(page.getByText(/Last automatic backup:/)).toBeVisible();
  expect(state.exports).toBe(1);
});

for (const restoreFails of [false, true]) {
  test(`restore ${restoreFails ? "failure" : "success"} retains a verified safety copy before upload`, async ({ context, page }) => {
    const state = await connectFixture(context, { restoreFails });
    await page.goto("/settings/backup");
    await page.locator('input[type="file"][accept=".zip,.tachibk,.json"]').setInputFiles({ name: "fixture.tachibk", mimeType: "application/gzip", buffer: archive });
    await page.getByRole("button", { name: "Back up and restore", exact: true }).click();
    await expect(page.getByText(restoreFails ? /Restore could not be confirmed\. The safety backup/ : /Backup restored successfully/)).toBeVisible();
    expect(state.restores).toBe(1);
    expect(state.safetyVerifiedBeforeRestore).toBe(true);
    await expect(page.getByRole("region", { name: "Saved backups" }).getByText(/Safety copy/)).toBeVisible();
  });
}
