import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

async function sourceActions(page: Page) {
  let refreshed = false, confirmRefresh = true;
  const operations: { name: string; variables: any }[] = [];
  const chapter = { id: 101, name: "Read chapter", chapterNumber: 1, sourceOrder: 1, isRead: true, lastPageRead: 4, pageCount: 8, isBookmarked: true, isDownloaded: false, uploadDate: "2026-11-03", scanlator: "Fixture" };
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, serverBaseUrl: "http://127.0.0.1:45679", connectionStatus: "connected", autoDownloadCount: 0 } })));
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    operations.push({ name, variables });
    let data: unknown;
    if (name === "GetMangaDetails") {
      const base = await mockSdk.GetMangaDetails({ id: 10001 });
      data = { manga: { ...base.manga, id: 42, initialized: true, title: "Source action fixture", realUrl: "https://source.example/series/fixture", description: refreshed ? "Updated details from the source." : "Original book details.", chapters: { nodes: [chapter] } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters: [chapter] } };
    else if (name === "RefreshMigrationTarget") {
      if (confirmRefresh) refreshed = true;
      data = { fetchMangaAndChapters: confirmRefresh ? { manga: { id: 42 }, chapters: [{ id: 101 }] } : null };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  await page.route("https://source.example/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Original source website</h1>" }));
  return { operations, failConfirmation: () => { confirmRefresh = false; } };
}

test("book refresh confirms new metadata and never resets read state or bookmarks", async ({ page }) => {
  const source = await sourceActions(page);
  await page.goto("/manga/42");
  await expect(page.getByText("Original book details.", { exact: true })).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh book and chapters", exact: true });
  await expect(refresh).toHaveAttribute("title", "Refresh book and chapters");
  await refresh.click();
  await expect(page.getByText("Updated details from the source.", { exact: true })).toBeVisible();
  await expect(page.getByText("Book details and chapters refreshed.", { exact: true })).toBeVisible();
  const call = source.operations.find((operation) => operation.name === "RefreshMigrationTarget");
  expect(call?.variables).toEqual({ input: { id: 42, fetchManga: true, fetchChapters: true } });
  expect(source.operations.filter((operation) => /^(UpdateChapter|UpdateChapters|UpdateChapterProgress)$/.test(operation.name))).toEqual([]);
  await expect(page.locator(".yomi-chapter-read")).toHaveText("Read");
  await expect(page.getByLabel("Bookmarked", { exact: true })).toHaveCount(1);
  source.failConfirmation();
  await refresh.click();
  await expect(page.getByText("The source couldn’t refresh this book. Your saved progress is kept.", { exact: true })).toBeVisible();
});

test("the source website control opens a separate browser tab with its safe original link", async ({ page, context }) => {
  await sourceActions(page);
  await context.route("https://source.example/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Original source website</h1>" }));
  await page.goto("/manga/42");
  const source = page.getByRole("link", { name: "Open book on source website", exact: true });
  await expect(source).toHaveAttribute("title", "Open book on source website");
  const popupPromise = context.waitForEvent("page");
  await source.click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Original source website" })).toBeVisible();
  expect(popup.url()).toBe("https://source.example/series/fixture");
  await expect(page).toHaveURL(/\/manga\/42$/);
  await popup.close();
});
