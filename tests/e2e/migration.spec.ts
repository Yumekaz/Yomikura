import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

const backend = "http://127.0.0.1:45677";
const chapter = (id: number, mangaId: number, number: number, state = {}) => ({ id, mangaId, name: number === 1 ? "Chapter One" : "Chapter Two", chapterNumber: number, sourceOrder: number, pageCount: 10,
  isRead: false, isBookmarked: false, lastPageRead: 0, isDownloaded: false, uploadDate: "2026-10-23T10:00:00Z", scanlator: "Fixture", ...state });

async function fixture(page: Page, options: { empty?: boolean; ambiguous?: boolean; changedPages?: boolean; fail?: boolean; duplicates?: boolean } = {}) {
  const titles = new Map([
    [1, { id: 1, title: "Migration fixture", inLibrary: true, sourceId: "fixture-source", categories: [5], chapters: [chapter(101, 1, 1, { isRead: true }), chapter(102, 1, 2, { isBookmarked: true, lastPageRead: 3 })] }],
    [2, { id: 2, title: options.duplicates ? "Migration fixture" : "Migration destination", inLibrary: !!options.duplicates, sourceId: "fixture-source", categories: [8], chapters: options.empty ? [] : [chapter(201, 2, 1, options.ambiguous ? { name: "Release A" } : {}), chapter(202, 2, 2, { pageCount: options.changedPages ? 20 : 10 })] }],
  ]);
  if (options.ambiguous) titles.get(2)!.chapters.push(chapter(203, 2, 1, { name: "Release B" }));
  const events: string[] = [];
  const pagination: { mangaId: number; after?: string }[] = [];
  let failing = !!options.fail;
  await page.addInitScript(({ backend }) => {
    if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected", autoDownloadCount: 0 } }));
  }, { backend });
  await page.route("**/api/graphql", async (route) => {
    if (new URL(route.request().url()).origin !== backend) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.id ?? variables.input?.mangaId;
    let data: unknown;
    if (name === "GetMangaDetails") {
      const base = await mockSdk.GetMangaDetails({ id }); const value = titles.get(id)!;
      data = { manga: { ...base.manga, id, title: value.title, inLibrary: value.inLibrary, source: { name: "Fixture source" }, categories: { nodes: value.categories.map((id) => ({ id })) }, chapters: { nodes: value.chapters } } };
    } else if (name === "GetSources") data = { sources: { totalCount: 1, nodes: [{ id: "fixture-source", name: "Fixture source", lang: "en", extension: { isInstalled: true } }] } };
    else if (name === "GetCategories") data = { categories: { nodes: [{ id: 0, name: "Default", order: 0 }, { id: 5, name: "Original category", order: 1 }, { id: 8, name: "Destination category", order: 2 }] } };
    else if (name === "FetchChapters") data = { fetchChapters: { chapters: titles.get(id)!.chapters } };
    else if (name === "FetchSourceManga") data = { fetchSourceManga: { hasNextPage: false, mangas: [...titles.values()].map((value) => ({ id: value.id, title: value.title, inLibrary: value.inLibrary, thumbnailUrl: "/placeholder-cover.svg" })) } };
    else if (name === "RefreshMigrationTarget") { events.push("refresh"); data = { fetchMangaAndChapters: { manga: { id }, chapters: titles.get(id)!.chapters.map(({ id }) => ({ id })) } }; }
    else if (name === "GetMigrationManga") {
      const value = titles.get(id)!; data = { manga: { id, title: value.title, sourceId: value.sourceId, inLibrary: value.inLibrary, categories: { nodes: value.categories.map((id) => ({ id })) } } };
    } else if (name === "GetMigrationChapters") {
      const value = titles.get(variables.mangaId)!; const after = variables.after; pagination.push({ mangaId: value.id, after });
      const nodes = value.chapters.slice(after ? 1 : 0, after ? undefined : 1);
      data = { chapters: { totalCount: value.chapters.length, pageInfo: { hasNextPage: !after && value.chapters.length > 1, endCursor: !after && value.chapters.length > 1 ? "next" : null }, nodes } };
    } else if (name === "GetChapter") {
      const record = [...titles.values()].flatMap((value) => value.chapters).find((chapter) => chapter.id === id)!;
      data = { chapter: { ...record, manga: { title: titles.get(record.mangaId)!.title, chapters: { edges: [] } } } };
    } else if (name === "UpdateChapterProgress") {
      if (id === 202 && failing) return route.fulfill({ status: 503, json: { errors: [{ message: "Fixture copy is temporarily unavailable" }] } });
      const record = [...titles.values()].flatMap((value) => value.chapters).find((chapter) => chapter.id === id)!;
      Object.assign(record, variables.input.patch); events.push(`progress:${id}`); data = { updateChapter: { chapter: { ...record } } };
    } else if (name === "ToggleMangaLibrary") {
      titles.get(id)!.inLibrary = variables.input.patch.inLibrary; events.push(`library:${id}:${variables.input.patch.inLibrary}`);
      data = { updateManga: { manga: { id, inLibrary: titles.get(id)!.inLibrary } } };
    } else if (name === "UpdateMangaCategories") {
      titles.get(id)!.categories = [...new Set([...titles.get(id)!.categories, ...variables.input.patch.addToCategories])]; events.push("categories");
      data = { updateManga: { manga: { id } } };
    } else if (name === "GetLibrary") data = { mangas: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [...titles.values()].filter((value) => value.inLibrary).map((value) => ({ id: value.id, title: value.title, thumbnailUrl: "/placeholder-cover.svg", unreadCount: 0, downloadCount: 0, lastReadChapter: null, categories: { nodes: value.categories.map((id) => ({ id })) } })) } };
    else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  await page.route("https://images.unsplash.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"/>' }));
  return { titles, events, pagination, allowCopy: () => { failing = false; } };
}

async function review(page: Page) {
  await page.goto("/manga/1");
  await page.getByRole("button", { name: "Migrate Source", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Source migration", exact: true });
  await dialog.getByRole("combobox", { name: "Target source", exact: true }).selectOption("fixture-source");
  await dialog.getByRole("button", { name: "Search matching titles", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Migration fixture (current title)", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Migration destination", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Review: Migration fixture → Migration destination", exact: true })).toBeVisible();
  return dialog;
}

test("migration reviews fetched paginated chapters and copies while retaining the original by default", async ({ page }, info) => {
  const data = await fixture(page); const dialog = await review(page);
  expect(data.events).toEqual(["refresh"]);
  expect(data.pagination).toEqual([{ mangaId: 1 }, { mangaId: 1, after: "next" }, { mangaId: 2 }, { mangaId: 2, after: "next" }]);
  await expect(dialog.getByText("2 matched · 0 unmatched · 0 ambiguous", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Replace original in library", exact: true })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Copy and keep original", exact: true }).click();
  await expect(dialog.getByText("The original is kept in your library.", { exact: true })).toBeVisible();
  expect(data.titles.get(1)!.inLibrary).toBe(true); expect(data.titles.get(2)!.inLibrary).toBe(true);
  expect(data.titles.get(2)!.chapters).toMatchObject([{ isRead: true }, { isBookmarked: true, lastPageRead: 3 }]);
  expect(data.titles.get(2)!.categories).toEqual([8, 5]);
  await page.screenshot({ path: info.outputPath("migration-copy-verified.png") });
});

test("replacement happens only after every selected transfer is confirmed", async ({ page }) => {
  const data = await fixture(page); const dialog = await review(page);
  await dialog.getByRole("checkbox", { name: "Replace original in library", exact: true }).check();
  await dialog.getByRole("button", { name: "Copy and replace original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Selected progress and categories verified", exact: true })).toBeVisible();
  expect(data.events[data.events.length - 1]).toBe("library:1:false"); expect(data.titles.get(1)!.inLibrary).toBe(false);
});

test("the user can select a partial copy while replacement remains disabled", async ({ page }) => {
  const data = await fixture(page); const dialog = await review(page);
  await dialog.getByRole("checkbox", { name: "Copy Chapter Two", exact: true }).uncheck();
  await expect(dialog.getByRole("checkbox", { name: "Replace original in library", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Copy and keep original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Selected progress and categories verified", exact: true })).toBeVisible();
  expect(data.titles.get(2)!.chapters).toMatchObject([{ isRead: true }, { isBookmarked: false, lastPageRead: 0 }]);
  expect(data.titles.get(1)!.inLibrary).toBe(true);
});

test("an empty destination cannot change library membership", async ({ page }) => {
  const data = await fixture(page, { empty: true }); const dialog = await review(page);
  await expect(dialog.getByRole("button", { name: "Copy and keep original", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("checkbox", { name: "Replace original in library", exact: true })).toBeDisabled();
  expect(data.events).toEqual(["refresh"]);
});

test("ambiguous chapter matches stay visible and cannot be selected", async ({ page }) => {
  const data = await fixture(page, { ambiguous: true }); const dialog = await review(page);
  await expect(dialog.getByText("1 matched · 0 unmatched · 1 ambiguous", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Copy Chapter One", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("checkbox", { name: "Replace original in library", exact: true })).toBeDisabled();
  expect(data.events).toEqual(["refresh"]);
});

test("different page counts are disclosed and partial positions remain unchanged", async ({ page }) => {
  const data = await fixture(page, { changedPages: true }); const dialog = await review(page);
  await expect(dialog.getByText(/Page position will stay unchanged/)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Replace original in library", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Copy and keep original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Selected progress and categories verified", exact: true })).toBeVisible();
  expect(data.titles.get(2)!.chapters[1]).toMatchObject({ isBookmarked: true, lastPageRead: 0 });
});

test("failed transfers retain the original and a refreshed retry finishes the copy", async ({ page }) => {
  const data = await fixture(page, { fail: true }); const dialog = await review(page);
  await dialog.getByRole("checkbox", { name: "Replace original in library", exact: true }).check();
  await dialog.getByRole("button", { name: "Copy and replace original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Migration needs attention", exact: true })).toBeVisible();
  expect(data.titles.get(1)!.inLibrary).toBe(true); expect(data.events).not.toContain("library:1:false");
  data.allowCopy(); await dialog.getByRole("button", { name: "Refresh mapping", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: /^Review:/ })).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Replace original in library", exact: true }).check();
  await dialog.getByRole("button", { name: "Copy and replace original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Selected progress and categories verified", exact: true })).toBeVisible();
  expect(data.titles.get(1)!.inLibrary).toBe(false);
});

test("closing a prepared review changes no library membership and restores focus", async ({ page }) => {
  const data = await fixture(page); const dialog = await review(page);
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Migrate Source", exact: true })).toBeFocused();
  expect(data.events).toEqual(["refresh"]);
});

test("duplicate merging uses the same review and preserves bookmarks and partial reading", async ({ page }) => {
  const data = await fixture(page, { duplicates: true });
  await page.goto("/settings/advanced");
  await page.getByRole("button", { name: "Review merge into 2", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Source migration", exact: true });
  await expect(dialog.getByRole("heading", { name: /^Review:/ })).toBeVisible();
  expect(data.events).toEqual(["refresh"]);
  await dialog.getByRole("checkbox", { name: "Replace original in library", exact: true }).check();
  await dialog.getByRole("button", { name: "Copy and replace original", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Selected progress and categories verified", exact: true })).toBeVisible();
  expect(data.titles.get(1)!.inLibrary).toBe(false);
  expect(data.titles.get(2)!.chapters).toMatchObject([{ isRead: true }, { isBookmarked: true, lastPageRead: 3 }]);
});
