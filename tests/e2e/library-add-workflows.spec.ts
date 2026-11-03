import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

const backend = "http://127.0.0.1:45678";
async function fixture(page: Page, duplicate = true) {
  const chapter = (id: number, mangaId: number, number: number) => ({ id, mangaId, name: `Chapter ${number}`, chapterNumber: number, sourceOrder: number, pageCount: 10, lastPageRead: 0, isRead: number === 1, isBookmarked: false, isDownloaded: false });
  const titles = new Map([
    [1, { id: 1, title: duplicate ? "The Shepherd Wizard" : "Another story", inLibrary: true, sourceId: "original", categories: [5], chapters: [chapter(101, 1, 1), chapter(102, 1, 2)] }],
    [2, { id: 2, title: "The Shepherd Wizard", inLibrary: false, sourceId: "alternate", categories: [] as number[], chapters: [chapter(201, 2, 1), chapter(202, 2, 2)] }],
  ]);
  const mutations: string[] = [];
  await page.addInitScript(({ backend }) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", autoDownloadCount: 0 } })), { backend });
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.id ?? variables.input?.mangaId;
    const record = titles.get(Number(id));
    let data: unknown;
    if (name === "GetHistory") {
      const manga = titles.get(2)!;
      data = { chapters: { pageInfo: { hasNextPage: false }, nodes: manga.chapters.map((chapter, index) => ({ ...chapter, isRead: false, lastPageRead: index + 1, lastReadAt: String(Date.now() - (1 - index) * 1000), manga: { id: 2, title: manga.title, thumbnailUrl: "/placeholder-cover.svg" } })) } };
    } else if (name === "GetLibrary") data = { mangas: { totalCount: [...titles.values()].filter((entry) => entry.inLibrary).length, pageInfo: { hasNextPage: false }, nodes: [...titles.values()].filter((entry) => entry.inLibrary).map((entry) => ({ ...entry, chapters: { totalCount: entry.chapters.length }, categories: { nodes: entry.categories.map((id) => ({ id })) }, thumbnailUrl: "/placeholder-cover.svg", downloadCount: 0, unreadCount: 1 })) } };
    else if (name === "GetMangaDetails") { const base = await mockSdk.GetMangaDetails({ id: 10001 }); data = { manga: { ...base.manga, ...record, thumbnailUrl: "/placeholder-cover.svg", source: { name: record?.sourceId === "original" ? "Original source" : "Alternate source" }, categories: { nodes: record!.categories.map((id) => ({ id })) }, chapters: { nodes: record!.chapters } } }; }
    else if (name === "GetMigrationManga") data = { manga: { ...record, categories: { nodes: record!.categories.map((id) => ({ id })) } } };
    else if (name === "GetSources") data = { sources: { totalCount: 2, pageInfo: { hasNextPage: false }, nodes: [{ id: "original", name: "Original source", lang: "en", extension: { isInstalled: true } }, { id: "alternate", name: "Alternate source", lang: "en", extension: { isInstalled: true } }] } };
    else if (name === "GetCategories") data = { categories: { nodes: [{ id: 0, name: "Default", order: 0 }, { id: 5, name: "Weekend reading", order: 1 }, { id: 7, name: "Favorites", order: 2 }] } };
    else if (name === "FetchChapters") data = { fetchChapters: { chapters: record!.chapters } };
    else if (name === "RefreshMigrationTarget") data = { fetchMangaAndChapters: { manga: { id }, chapters: record!.chapters } };
    else if (name === "GetMigrationChapters") { const entry = titles.get(variables.mangaId)!; data = { chapters: { totalCount: entry.chapters.length, pageInfo: { hasNextPage: false }, nodes: entry.chapters } }; }
    else if (name === "ToggleMangaLibrary") { record!.inLibrary = variables.input.patch.inLibrary; mutations.push(`library:${id}:${record!.inLibrary}`); data = { updateManga: { manga: { id, inLibrary: record!.inLibrary } } }; }
    else if (name === "UpdateMangaCategories") { record!.categories = variables.input.patch.addToCategories; mutations.push(`categories:${id}`); data = { updateManga: { manga: { id } } }; }
    else { const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  return { titles, mutations };
}

test("history includes a non-library comic once and its heart opens category assignment", async ({ page }) => {
  const data = await fixture(page, false);
  await page.goto("/history");
  await expect(page.locator(".yomi-history-row")).toHaveCount(1);
  await expect(page.getByText("Chapter 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add The Shepherd Wizard to library", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to library", exact: true });
  await dialog.getByRole("checkbox", { name: "Weekend reading", exact: true }).check();
  await dialog.getByRole("button", { name: "Save to library", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add The Shepherd Wizard to library", exact: true })).toHaveCount(0);
  expect(data.titles.get(2)!.inLibrary).toBe(true);
  expect(data.titles.get(2)!.categories).toEqual([5]);
});

test("adding an alternate source warns before changing membership and Add anyway selects categories", async ({ page }) => {
  const data = await fixture(page);
  await page.goto("/manga/2");
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  const duplicates = page.getByRole("dialog", { name: "Possible duplicates", exact: true });
  await expect(duplicates.getByText("Original source", { exact: true })).toBeVisible();
  await expect(duplicates.getByRole("link", { name: "Show entry", exact: true })).toHaveAttribute("href", "/manga/1");
  expect(data.mutations).toEqual([]);
  await duplicates.getByRole("button", { name: "Add anyway", exact: true }).click();
  const categories = page.getByRole("dialog", { name: "Add to library", exact: true });
  await categories.getByRole("checkbox", { name: "Favorites", exact: true }).check();
  await categories.getByRole("button", { name: "Save to library", exact: true }).click();
  await expect(categories).toHaveCount(0);
  expect(data.titles.get(1)!.inLibrary).toBe(true);
  expect(data.titles.get(2)!.inLibrary).toBe(true);
  expect(data.titles.get(2)!.categories).toEqual([7]);
});

test("a duplicate can open Copy or Migrate with chapter/category choices without writing on cancellation", async ({ page }) => {
  const data = await fixture(page);
  await page.goto("/manga/2");
  for (const action of ["Copy", "Migrate"]) {
    await page.getByRole("button", { name: "Add to Library", exact: true }).click();
    await page.getByRole("dialog", { name: "Possible duplicates", exact: true }).getByRole("button", { name: action, exact: true }).click();
    const review = page.getByRole("dialog", { name: "Source migration", exact: true });
    await expect(review.getByRole("heading", { name: /^Review:/ })).toBeVisible();
    await expect(review.getByRole("checkbox", { name: "Chapters", exact: true })).toBeChecked();
    await expect(review.getByRole("checkbox", { name: "Categories", exact: true })).toBeChecked();
    if (action === "Migrate") await expect(review.getByRole("checkbox", { name: "Replace original in library", exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(review).toHaveCount(0);
  }
  expect(data.mutations).toEqual([]);
});
