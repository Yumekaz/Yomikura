import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const backend = "http://127.0.0.1:45676";
const title = "Chapter ending fixture";
const picture = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="#264653"/></svg>';

async function fixture(page: Page, options: { failLastPage?: boolean; filteredNext?: boolean } = {}) {
  let includeNext = options.filteredNext === true;
  let currentPage = 0, read = false;
  const patches: { isRead?: boolean; lastPageRead?: number }[] = [];
  await page.addInitScript(({ backend, filteredNext }) => {
    localStorage.setItem("yomikura-library-sessions-v1", JSON.stringify({ [backend]: { marker: "11111111-1111-4111-8111-111111111111" } }));
    localStorage.setItem("yomikura-settings", JSON.stringify({ state: {
      serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", readerMode: "WEBTOON", pageTransition: "none", infiniteChapterReading: false, autoDownloadCount: 0, autoDeleteReadChapters: false,
      experience: { reader: { pauseBetweenChapters: true, skipRead: filteredNext } },
    }, version: 0 }));
  }, { backend, filteredNext: !!options.filteredNext });
  await page.route(`${backend}/api/graphql`, async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const operation = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.chapterId ?? variables.input?.id;
    let data: unknown;
    if (operation === "GetChapter") data = { chapter: {
      id, name: id === 13 ? "Chapter 60" : "Chapter 59", chapterNumber: id === 13 ? 60 : 59,
      mangaId: 42, sourceOrder: id === 13 ? 60 : 59, pageCount: 2, isRead: id === 13 ? !!options.filteredNext : read,
      isBookmarked: false, isDownloaded: false, lastPageRead: id === 13 ? 0 : currentPage,
      manga: { title, chapters: { edges: [{ node: { id: 12, chapterNumber: 59 } }, ...(includeNext ? [{ node: { id: 13, chapterNumber: 60 } }] : [])] } },
    } };
    else if (operation === "GetReadingChapters") data = chapterConnection(42, [
      { id: 12, chapterNumber: 59, name: "Chapter 59", isRead: read },
      ...(includeNext ? [{ id: 13, chapterNumber: 60, name: "Chapter 60", isRead: !!options.filteredNext }] : []),
    ]);
    else if (operation === "FetchChapterPages") data = { fetchChapterPages: { pages: [0, 1].map((index) => `${backend}/api/v1/manga/42/chapter/${id === 13 ? 60 : 59}/page/${index}`) } };
    else if (operation === "UpdateChapterProgress") {
      const patch = variables.input.patch; patches.push(patch);
      read = patch.isRead ?? read; currentPage = patch.lastPageRead ?? currentPage;
      data = { updateChapter: { chapter: { id: 12, isRead: read, lastPageRead: currentPage } } };
    } else {
      const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[operation];
      if (!method) throw new Error(`Unhandled reader-end fixture operation ${operation}`);
      data = await method(variables);
    }
    await route.fulfill({ json: { data } });
  });
  await page.route(`${backend}/api/v1/manga/42/chapter/*/page/*`, (route) => {
    if (options.failLastPage && route.request().url().endsWith("/page/1")) return route.abort("failed");
    return route.fulfill({ contentType: "image/svg+xml", body: picture });
  });
  await page.goto("/reader/12");
  await expect(page.getByText("Chapter 59", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  if (!options.failLastPage) {
    await expect(page.getByRole("region", { name: "Reading surface", exact: true })).toHaveAttribute("aria-busy", "false");
    await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toHaveCSS("opacity", "1");
  }
  return { addNext: () => { includeNext = true; }, patches };
}

test("the confirmed latest chapter has a meaningful ending and can discover a later chapter", async ({ page }) => {
  const data = await fixture(page);
  const ending = page.getByRole("region", { name: "Chapter end", exact: true });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending.getByText("Finished", { exact: true })).toBeVisible();
  await expect(ending.getByText("There’s no next chapter.", { exact: true })).toBeVisible();
  await page.mouse.wheel(0, 100000);
  await expect(ending.getByText("There’s no next chapter.", { exact: true })).toBeInViewport();
  await expect(ending.getByRole("link", { name: "View chapters", exact: true })).toHaveAttribute("href", "/manga/42");
  await expect.poll(() => data.patches.some((patch) => patch.isRead === true)).toBe(true);

  data.addNext();
  await ending.getByRole("button", { name: "Check chapter list", exact: true }).click();
  await expect(ending.getByText("There’s no next chapter.", { exact: true })).toHaveCount(0);
  await expect(ending.getByText("Next chapter", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveAttribute("href", "/reader/13");
  await expect(page.getByText("2 of 2 pages", { exact: true })).toBeVisible();
});

test("a filtered next chapter is not announced as the source's last chapter", async ({ page }) => {
  await fixture(page, { filteredNext: true });
  const ending = page.getByRole("region", { name: "Chapter end", exact: true });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending.getByText("No next chapter in this reading list.", { exact: true })).toBeVisible();
  await expect(ending.getByText("There’s no next chapter.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);
});

test("a failed final image never becomes a finished chapter announcement", async ({ page }) => {
  const data = await fixture(page, { failLastPage: true });
  await expect(page.getByText("Failed to load page 2", { exact: true })).toBeVisible({ timeout: 15000 });
  const ending = page.getByRole("region", { name: "Chapter end", exact: true });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending.getByText("Some pages couldn’t be loaded.", { exact: true })).toBeVisible();
  await expect(ending.getByText("Finished", { exact: true })).toHaveCount(0);
  await expect(ending.getByText("There’s no next chapter.", { exact: true })).toHaveCount(0);
  expect(data.patches.every((patch) => patch.isRead !== true)).toBe(true);
});
