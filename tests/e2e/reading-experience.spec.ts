import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";
const backend = "http://127.0.0.1:45679";
async function fixture(page: Page, options: { allRead?: boolean; marathon?: boolean } = {}) {
  const now = Date.now() - 60_000;
  const chapters = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, mangaId: 10002, name: `Chapter ${index + 1}`, chapterNumber: index + 1, sourceOrder: index + 1, isRead: !!options.allRead || index < 50, isBookmarked: false, isDownloaded: false, lastPageRead: index < 50 ? 2 : index === 50 ? 1 : 0, pageCount: 3, scanlator: "Group A", uploadDate: "2026-10-25" }));
  const second = { ...chapters[0], id: 2000, mangaId: 20002, isRead: false, name: "Other chapter", chapterNumber: 1 };
  let online = true;
  const writes: { id: number; patch: unknown }[] = [];
  const seenCursors: unknown[] = [];
  await page.addInitScript((backend) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", readerMode: "LTR", pageSpread: "SINGLE", autoDownloadCount: 0, infiniteChapterReading: false } }));
  }, backend);
  const history = options.marathon ? Array.from({ length: 500 }, (_, index) => ({ ...chapters[0], id: index + 1, name: `Past chapter ${index + 1}`, chapterNumber: index + 1, lastReadAt: String(now + index), manga: { id: 10002, title: "Fixture comic", thumbnailUrl: null } })) : chapters.filter((chapter) => chapter.isRead).map((chapter) => ({ ...chapter, lastReadAt: String(now + chapter.id), manga: { id: 10002, title: "Fixture comic", thumbnailUrl: null } }));
  history.push({ ...second, lastReadAt: String(now - 1), manga: { id: 20002, title: "Another comic", thumbnailUrl: null } });
  await page.route("**/api/graphql", async (route) => {
    if (!online) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.id ?? variables.input?.chapterId;
    const chapter = [...chapters, second].find((chapter) => chapter.id === id);
    let data: unknown;
    if (name === "GetMangaDetails") {
      const original = await mockSdk.GetMangaDetails({ id: 10002 });
      data = { manga: { ...original.manga, initialized: true, title: "Fixture comic", thumbnailUrl: null, chapters: { nodes: chapters }, categories: { nodes: [] } } };
    } else if (name === "GetLibrary") data = { mangas: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
      { id: 10002, title: "Fixture comic", thumbnailUrl: null, unreadCount: chapters.filter((chapter) => !chapter.isRead).length, downloadCount: 0, lastReadChapter: null, categories: { nodes: [] } },
      { id: 20002, title: "Another comic", thumbnailUrl: null, unreadCount: 1, downloadCount: 0, lastReadChapter: null, categories: { nodes: [] } },
    ] } };
    else if (name === "GetHistory") {
      seenCursors.push(variables.after);
      const ordered = [...history].sort((a, b) => Number(b.lastReadAt) - Number(a.lastReadAt));
      const offset = Number(variables.after ?? 0), size = variables.first ?? 40;
      data = { chapters: { nodes: ordered.slice(offset, offset + size), pageInfo: { hasNextPage: offset + size < ordered.length, endCursor: offset + size < ordered.length ? String(offset + size) : null } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters } };
    else if (name === "GetReadingChapters") data = chapterConnection(10002, chapters);
    else if (name === "GetChapter") data = { chapter: { ...chapter, manga: { title: chapter?.mangaId === 20002 ? "Another comic" : "Fixture comic" } } };
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [0, 1, 2].map((index) => `${backend}/api/v1/manga/10002/chapter/${chapter!.sourceOrder}/page/${index}`) } };
    else if (name === "UpdateChapterProgress") {
      writes.push({ id, patch: variables.input.patch }); Object.assign(chapter!, variables.input.patch);
      const event = { ...chapter!, lastReadAt: String(Date.now()), manga: { id: 10002, title: "Fixture comic", thumbnailUrl: null } };
      const index = history.findIndex((entry) => entry.id === id); if (index >= 0) history[index] = event; else history.push(event);
      data = { updateChapter: { chapter } };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/manga/*/chapter/*/page/*", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#31483b"/></svg>' }));
  return { chapters, writes, seenCursors, offline: () => { online = false; } };
}

test("Resume advances from 50 completed chapters to chapter 51 in either display direction", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/manga/10002");
  const resume = page.getByRole("link", { name: "Resume", exact: true });
  await expect(resume).toHaveAttribute("href", "/reader/51");
  await page.getByRole("button", { name: "Ascending chapters", exact: true }).click();
  await expect(resume).toHaveAttribute("href", "/reader/51");
  await expect(page.locator(".yomi-chapter-row").first()).toContainText("Chapter 100");
  await page.getByRole("button", { name: "Select chapters", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Chapter 50", exact: true }).check();
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await expect.poll(() => state.chapters[49].isRead).toBe(false);
  await expect(resume).toHaveAttribute("href", "/reader/50");
});

test("the library Continue card advances past a completed latest chapter", async ({ page }) => {
  await fixture(page); await page.goto("/library");
  await expect(page.getByRole("region", { name: "Continue reading", exact: true }).getByRole("link", { name: "Continue reading", exact: true })).toHaveAttribute("href", "/reader/51");
});

test("history keeps one latest activity per comic and continues a completed chapter forwards", async ({ page }) => {
  await fixture(page); await page.goto("/history");
  await expect(page.locator("article.yomi-history-row")).toHaveCount(2);
  const row = page.locator("article.yomi-history-row").filter({ hasText: "Fixture comic" });
  await expect(row).toHaveCount(1); await expect(row).toContainText("Chapter 50");
  await row.getByRole("button", { name: "Continue Fixture comic", exact: true }).first().click();
  await expect(page).toHaveURL(/\/reader\/51$/);
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toBeVisible();
});

test("removing a comic hides all its earlier chapters, keeps progress, and permits new reading activity", async ({ page }) => {
  const state = await fixture(page); await page.goto("/history");
  await page.getByRole("button", { name: "Remove Fixture comic from history", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("article.yomi-history-row")).toHaveCount(1);
  expect(state.writes).toHaveLength(0); expect(state.chapters[49].isRead).toBe(true);
  await page.reload(); await expect(page.locator("article.yomi-history-row").filter({ hasText: "Fixture comic" })).toHaveCount(0);
  await page.goto("/reader/51");
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toBeVisible();
  await expect.poll(() => state.writes.length).toBeGreaterThan(0);
  await page.goto("/history");
  const row = page.locator("article.yomi-history-row").filter({ hasText: "Fixture comic" });
  await expect(row).toHaveCount(1); await expect(row).toContainText("Chapter 51");
  state.offline(); await page.reload();
  await expect(row).toHaveCount(1); await expect(row).toContainText("Chapter 51");
});

test("history removal survives older backend pages and searching keeps a usable clear action", async ({ page }) => {
  const state = await fixture(page, { marathon: true }); await page.goto("/history");
  await expect.poll(() => state.seenCursors.length).toBe(5);
  await page.getByRole("button", { name: "Remove Fixture comic from history", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Load older activity", exact: true }).click();
  await expect.poll(() => state.seenCursors.length).toBe(10);
  await expect(page.locator("article.yomi-history-row").filter({ hasText: "Fixture comic" })).toHaveCount(0);
  await page.getByRole("button", { name: "Load older activity", exact: true }).click();
  await expect(page.locator("article.yomi-history-row")).toHaveCount(1);
  await expect(page.locator("article.yomi-history-row")).toContainText("Another comic");
  await page.getByRole("searchbox", { name: "Search reading history", exact: true }).fill("missing title");
  await expect(page.getByRole("heading", { name: "No comics match your search", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator("article.yomi-history-row")).toHaveCount(1);
});

test("a fully read book offers Read again rather than pretending it has no chapters", async ({ page }) => {
  await fixture(page, { allRead: true }); await page.goto("/manga/10002");
  await expect(page.getByRole("link", { name: "Read again", exact: true })).toHaveAttribute("href", "/reader/1");
  await expect(page.getByRole("link", { name: "Resume", exact: true })).toHaveCount(0);
});

test("web setup recommends the installer and preserves the connection form through retries", async ({ page }) => {
  await page.route("https://api.github.com/repos/Yumekaz/Yomikura/releases/latest", (route) => route.fulfill({ json: { assets: [{ name: "Yomikura_x64-setup.exe", browser_download_url: "https://github.com/Yumekaz/Yomikura/releases/download/v1/Yomikura_x64-setup.exe" }] } }));
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
    await route.fulfill({ json: { data: method ? await method(variables) : { __typename: "Query" } } });
  });
  await page.goto("/library");
  await expect(page.getByRole("link", { name: "Download Yomikura Desktop", exact: true })).toHaveAttribute("href", /\/releases\/download\/v1\/.*setup\.exe$/);
  await page.getByText("Connect an existing library", { exact: true }).click();
  const address = page.getByLabel("Library address", { exact: true });
  await address.fill("http://127.0.0.1:45678");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(address).toHaveValue("http://127.0.0.1:45678");
  await page.getByRole("button", { name: "Connect & Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn’t reach your library");
  await expect(address).toHaveValue("http://127.0.0.1:45678");
  await address.fill(backend); await page.getByRole("button", { name: "Connect & Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
});
