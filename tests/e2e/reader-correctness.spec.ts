import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const backend = "http://127.0.0.1:45679";
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#264653"/></svg>';
const pageImage = (page: Page, number: number) => page.locator('[id^="reader-page-"]').getByRole("img", { name: `Page ${number}`, exact: true });

async function fixture(page: Page, options: { read?: boolean; pages?: number; spread?: string; blockedPage?: number; failPage?: number } = {}) {
  const count = options.pages ?? 3;
  const patches: { isRead: boolean; lastPageRead: number }[] = [];
  const deleted: number[] = [];
  let read = options.read ?? false;
  let lastPageRead = 0;
  let release!: () => void;
  const pendingImage = new Promise<void>((resolve) => { release = resolve; });
  await page.addInitScript(({ backend, spread }) => {
    localStorage.setItem("yomikura-settings", JSON.stringify({ state: {
      serverBaseUrl: backend, mockMode: false, readerMode: "LTR", pageSpread: spread,
      connectionStatus: "connected", autoDeleteReadChapters: true, autoDownloadCount: 0,
      pageTransition: "none", infiniteChapterReading: false,
    }, version: 0 }));
  }, { backend, spread: options.spread ?? "SINGLE" });
  await page.route(`${backend}/api/graphql`, async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetChapter") {
      data = { chapter: { id: 12, name: "Reader correctness fixture", chapterNumber: 1, isRead: read, lastPageRead, pageCount: count, sourceOrder: 1, mangaId: 10002, manga: { title: "Reader fixture", chapters: { edges: [{ node: { id: 12, chapterNumber: 1 } }] } } } };
    } else if (name === "GetReadingChapters") {
      data = chapterConnection(10002, [{ id: 12, chapterNumber: 1, name: "Reader correctness fixture", isRead: read }]);
    } else if (name === "FetchChapterPages") {
      data = { fetchChapterPages: { pages: Array.from({ length: count }, (_, i) => `${backend}/api/v1/manga/10002/chapter/1/page/${i}`) } };
    } else if (name === "UpdateChapterProgress") {
      const patch = variables.input.patch;
      patches.push(patch);
      read = patch.isRead;
      lastPageRead = patch.lastPageRead;
      data = { updateChapter: { chapter: { id: 12, isRead: read, lastPageRead } } };
    } else if (name === "DeleteDownloadedChapter") {
      deleted.push(variables.input.id);
      data = { deleteDownloadedChapter: { clientMutationId: null } };
    } else {
      const method = (mockSdk as unknown as Record<string, (variables: unknown) => Promise<unknown>>)[name];
      if (!method) throw new Error(`Unhandled fixture operation: ${name}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  await page.route(`${backend}/api/v1/manga/*/chapter/*/page/*`, async (route) => {
    const index = Number(new URL(route.request().url()).pathname.split("/").pop());
    if (index === options.failPage) return route.abort("failed");
    if (index === options.blockedPage) await pendingImage;
    await route.fulfill({ contentType: "image/svg+xml", body: image });
  });
  await page.goto("/reader/12");
  await expect(page.getByText("Reader correctness fixture", { exact: true })).toBeVisible();
  return { patches, deleted, release };
}

test("rereading preserves completion and does not repeat automatic deletion", async ({ page }) => {
  const state = await fixture(page, { read: true });
  await expect(pageImage(page, 1)).toHaveCSS("opacity", "1");
  await expect.poll(() => state.patches.length).toBeGreaterThan(0);
  await page.keyboard.press("ArrowRight");
  await expect(pageImage(page, 2)).toHaveCSS("opacity", "1");
  await page.keyboard.press("ArrowRight");
  await expect(pageImage(page, 3)).toHaveCSS("opacity", "1");
  await expect.poll(() => state.patches.at(-1)?.lastPageRead).toBe(2);
  expect(state.patches.every((patch) => patch.isRead)).toBe(true);
  expect(state.deleted).toEqual([]);
});

test("a failed final page cannot complete or delete the chapter", async ({ page }) => {
  const state = await fixture(page, { failPage: 2 });
  await expect(pageImage(page, 1)).toHaveCSS("opacity", "1");
  await page.keyboard.press("ArrowRight");
  await expect(pageImage(page, 2)).toHaveCSS("opacity", "1");
  await expect.poll(() => state.patches.at(-1)?.lastPageRead).toBe(1);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Failed to load page 3", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.goto("/settings/backup");
  expect(state.patches.every((patch) => !patch.isRead && patch.lastPageRead < 2)).toBe(true);
  expect(state.deleted).toEqual([]);
});

for (const spread of ["SINGLE", "DOUBLE"] as const) {
  test(`${spread.toLowerCase()} completion waits for every displayed image`, async ({ page }) => {
    const count = spread === "SINGLE" ? 1 : 2;
    const state = await fixture(page, { pages: count, spread, blockedPage: count - 1 });
    if (count === 2) await expect(pageImage(page, 1)).toHaveCSS("opacity", "1");
    // Stay longer than the reader's progress debounce while the last image is pending.
    await page.waitForTimeout(1100);
    expect(state.patches).toEqual([]);
    expect(state.deleted).toEqual([]);
    state.release();
    await expect(pageImage(page, count)).toHaveCSS("opacity", "1");
    await expect.poll(() => state.patches.at(-1)?.isRead).toBe(true);
    await expect.poll(() => state.deleted).toEqual([12]);
  });
}
