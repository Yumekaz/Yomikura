import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRecoveryFile, describeRecoveryPage, openRecoveryFile } from "../../src/api/suwayomi/deviceRecoveryFormat";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { parseRecoveryPreferences } from "../../src/stores/recoveryPreferences";
import { chapterConnection } from "./fixtures/chapterConnection";

const server = "http://127.0.0.1:45679";
const marker = "11111111-1111-4111-8111-111111111111";
const identity = { chapterId: 12, chapterName: "Recovery chapter", mangaId: 42, mangaTitle: "Recovery book", chapterNumber: 1, sourceOrder: 1, pageCount: 2 };
const pages = [0, 1].map((index) => `${server}/api/v1/manga/42/chapter/1/page/${index}`);
const bytes = async () => new Uint8Array(await readFile("public/demo/paper-garden-page.webp"));

async function fixture(page: Page) {
  const remote = { marker, online: true, page: 0 };
  const writes: { lastPageRead?: number; isRead?: boolean }[] = [];
  await page.addInitScript(({ server, marker }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: server, mockMode: false, connectionStatus: "connected", themeMode: "dark" } }));
    if (!localStorage.getItem("yomikura-library-sessions-v1")) localStorage.setItem("yomikura-library-sessions-v1", JSON.stringify({ [server]: { marker } }));
    const put = Cache.prototype.put;
    Cache.prototype.put = function (request, response) {
      if (String(request).includes("/page/1?") && String(request).includes("__yomi_recovery") && localStorage.getItem("fixture-quota")) throw new DOMException("Fixture full storage", "QuotaExceededError");
      return put.call(this, request, response);
    };
  }, { server, marker });
  await page.route(`${server}/api/graphql`, async (route) => {
    if (!remote.online) return route.abort("connectionrefused");
    const { operationName: name, variables } = route.request().postDataJSON();
    const chapter = () => ({ id: 12, name: identity.chapterName, mangaId: 42, manga: { title: identity.mangaTitle }, chapterNumber: 1, sourceOrder: 1, pageCount: 2, lastPageRead: remote.page, lastReadAt: "103", isRead: false, isBookmarked: false });
    let data: unknown;
    if (name === "YomikuraLibraryIdentity") data = { metas: { nodes: [{ key: "yomikura.library.identity.v1", value: remote.marker }] } };
    else if (name === "GetChapter") data = { chapter: chapter() };
    else if (name === "GetReadingChapters") data = chapterConnection(42, [chapter()]);
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages } };
    else if (name === "GetMigrationManga") data = { manga: { id: 42, title: identity.mangaTitle } };
    else if (name === "GetMangaDetails") data = { manga: { ...(await mockSdk.GetMangaDetails({ id: 42 })).manga, id: 42, title: identity.mangaTitle, meta: [] } };
    else if (name === "UpdateChapterProgress") {
      const patch = variables.input.patch;
      writes.push(patch);
      remote.page = patch.lastPageRead ?? remote.page;
      data = { updateChapter: { chapter: chapter() } };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  for (const url of pages) await page.route(url, (route) => route.abort("connectionrefused"));
  return { remote, writes };
}

async function archive() {
  const body = new Blob([await bytes()], { type: "image/webp" });
  const description = await describeRecoveryPage(body);
  return createRecoveryFile({
    id: "22222222-2222-4222-8222-222222222222", libraryId: marker, createdAt: new Date().toISOString(),
    preferences: parseRecoveryPreferences({ themeMode: "light", readerMode: "LTR" }),
    notes: [{ mangaId: 42, title: identity.mangaTitle, value: "Unsynced note from the old device." }],
    progress: [{ chapter: identity, patch: { lastPageRead: 1 } }],
    chapters: [{ ...identity, pages: [description, description], lastPageRead: 1, isRead: false }],
  }, [body, body]);
}

async function action(page: Page, button: string, confirm: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: confirm, exact: true }).click();
}

test("device recovery resumes a partial import and reviews progress in the matching library", async ({ page }) => {
  test.setTimeout(75_000);
  const { remote, writes } = await fixture(page);
  await page.goto("/settings/backup");
  const file = await archive();
  await page.getByLabel("Open recovery file").setInputFiles({ name: "recovery.yomirecovery", mimeType: file.type, buffer: Buffer.from(await file.arrayBuffer()) });
  await expect(page.getByRole("heading", { name: "Staged recovery" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 note · 1 reading update · 1 saved chapter", { exact: false })).toBeVisible();

  await action(page, "Apply recovered preferences", "Apply preferences");
  await expect(page.getByRole("button", { name: "Restore earlier preferences", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.themeMode)).toBe("light");

  await page.evaluate(() => localStorage.setItem("fixture-quota", "1"));
  await action(page, "Restore notes and saved chapters", "Restore device records");
  await expect(page.getByRole("alert").filter({ hasText: "There is too little free storage" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Restore notes and saved chapters", exact: true })).toBeEnabled();
  await page.evaluate(() => localStorage.removeItem("fixture-quota"));
  await action(page, "Restore notes and saved chapters", "Restore device records");
  await expect(page.getByRole("button", { name: "Device records restored", exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  // Opening the restored download while offline must not resurrect the
  // archive's unreviewed progress through the reader's initial page save.
  const initialOfflinePage = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomikura-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction("chapters").objectStore("chapters").getAll();
        request.onsuccess = () => resolve(request.result.find((record) => record.id === 12).lastPageRead);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  });
  expect(initialOfflinePage).toBe(0);

  remote.marker = "33333333-3333-4333-8333-333333333333";
  await page.getByRole("button", { name: "Review progress for Recovery chapter", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /different library|created this recovery file/ })).toBeVisible();
  expect(writes).toEqual([]);
  remote.marker = marker;
  await action(page, "Review progress for Recovery chapter", "Apply saved update");
  await expect.poll(() => writes.map((item) => item.lastPageRead)).toEqual([1]);

  const exported = page.waitForEvent("download");
  await page.getByRole("checkbox", { name: "Include saved chapter pages from this device" }).check();
  await page.getByRole("button", { name: "Export device recovery", exact: true }).click();
  const stored = new Blob([new Uint8Array(await readFile((await (await exported).path())!))]);
  const roundTrip = await openRecoveryFile(stored);
  expect(roundTrip.manifest.notes[0]?.value).toBe("Unsynced note from the old device.");
  expect(roundTrip.manifest.chapters[0]?.pages).toHaveLength(2);
  expect(roundTrip.manifest.preferences.themeMode).toBe("light");

  remote.online = false;
  await page.goto("/reader/12");
  const image = page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect(image).toHaveCSS("opacity", "1");
});

test("a recovery file with a changed header fails before staging", async () => {
  const file = await archive();
  const contents = new Uint8Array(await file.arrayBuffer());
  contents[30] ^= 1;
  await expect(openRecoveryFile(new Blob([contents]))).rejects.toThrow("integrity check");
});
