import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
const backend = "http://127.0.0.1:45679";
async function fixture(page: Page) {
  const chapters = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, mangaId: 10002, name: `Chapter ${i + 1}`, chapterNumber: i + 1, sourceOrder: i + 1, isRead: i < 50, isBookmarked: false, isDownloaded: false, lastPageRead: i < 50 ? 2 : 1, pageCount: 3, uploadDate: "2026-10-25", scanlator: "Fixture" }));
  let note = "Original note", notesOnline = true, writesOnline = true, refreshCount = 0;
  const noteWrites: string[] = [];
  await page.addInitScript((backend) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected" } })); }, backend);
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    const id = variables.id ?? variables.input?.id; const chapter = chapters.find((chapter) => chapter.id === id);
    let data: unknown;
    if (name === "GetMangaDetails") { const original = await mockSdk.GetMangaDetails({ id: 10002 }); data = { manga: { ...original.manga, initialized: true, title: "Comic actions fixture", realUrl: "https://example.com/book/fixture", description: "A long description. ".repeat(50), thumbnailUrl: null, chapters: { nodes: chapters } } }; }
    else if (name === "FetchChapters") data = { fetchChapters: { chapters } };
    else if (name === "GetChapter") data = { chapter: { ...chapter, manga: { title: "Comic actions fixture" } } };
    else if (name === "GetMangaNotes") { if (!notesOnline) return route.abort("connectionrefused"); data = { manga: { id: 10002, meta: [{ key: "yomikura.notes.v1", value: note }] } }; }
    else if (name === "SaveMangaNote") { if (!notesOnline) return route.abort("connectionrefused"); note = variables.input.meta.value; noteWrites.push(note); data = { setMangaMeta: { meta: variables.input.meta } }; }
    else if (name === "RefreshMigrationTarget") { refreshCount++; data = { fetchMangaAndChapters: { manga: { id: 10002 }, chapters: chapters.map(({ id }) => ({ id })) } }; }
    else if (name === "UpdateChapterProgress") { if (!writesOnline) return route.abort("connectionrefused"); Object.assign(chapter!, variables.input.patch); data = { updateChapter: { chapter } }; }
    else { const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  return { chapters, noteWrites, setNote: (text: string) => { note = text; }, setNotesOnline: (value: boolean) => { notesOnline = value; }, setWritesOnline: (value: boolean) => { writesOnline = value; }, refreshCount: () => refreshCount };
}
test("book details expose source actions, refresh, expandable synopsis and a sticky first-unread Resume", async ({ page }) => {
  const state = await fixture(page); await page.goto("/manga/10002");
  await expect(page.getByRole("link", { name: "Open book on source website" })).toHaveAttribute("href", "https://example.com/book/fixture");
  await page.getByRole("button", { name: "Read synopsis", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Refresh book and chapters", exact: true }).click();
  await expect.poll(state.refreshCount).toBe(1);
  await page.locator(".yomi-chapter-row").last().scrollIntoViewIfNeeded();
  const sticky = page.getByRole("link", { name: "Resume Comic actions fixture", exact: true });
  await expect(sticky).toBeVisible(); await expect(sticky).toHaveAttribute("href", "/reader/51");
});
test("chapter context actions support right click and keyboard without adjacent selection controls", async ({ page }) => {
  const state = await fixture(page); await page.goto("/manga/10002");
  const row = page.locator(".yomi-chapter-row").filter({ has: page.getByRole("link", { name: /^Chapter 50\b/ }) });
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark unread", exact: true }).click();
  await expect.poll(() => state.chapters[49].isRead).toBe(false);
  await expect(row).toHaveAttribute("aria-busy", "false");
  const trigger = row.getByRole("button", { name: "Actions for Chapter 50", exact: true });
  await trigger.focus(); await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Mark read", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect.poll(() => state.chapters[49].isBookmarked).toBe(true);
  await expect(page.getByRole("checkbox", { name: /^Select Chapter/ })).toHaveCount(0);
});
test("bookmark changes survive an outage and reload without resetting completed chapter state", async ({ page }) => {
  const state = await fixture(page); await page.goto("/manga/10002"); state.setWritesOnline(false);
  const row = page.locator(".yomi-chapter-row").filter({ has: page.getByRole("link", { name: /^Chapter 50\b/ }) });
  await row.getByRole("button", { name: "Actions for Chapter 50", exact: true }).click(); await page.getByRole("menuitem", { name: "Bookmark", exact: true }).click();
  await expect(row.getByLabel("Bookmarked", { exact: true })).toBeVisible();
  await page.reload();
  const reloaded = page.locator(".yomi-chapter-row").filter({ has: page.getByRole("button", { name: "Actions for Chapter 50", exact: true }) });
  await expect(reloaded).toContainText("Read"); await expect(reloaded.getByLabel("Bookmarked", { exact: true })).toBeVisible();
  state.setWritesOnline(true); await page.reload(); await expect.poll(() => state.chapters[49].isBookmarked).toBe(true); expect(state.chapters[49].isRead).toBe(true);
});
test("notes retain local edits across reload and require review before replacing another device’s version", async ({ page }) => {
  const state = await fixture(page); await page.goto("/manga/10002");
  const open = () => page.locator(".yomi-book-notes > summary").click(); await open();
  const editor = page.getByRole("textbox", { name: "A note for Comic actions fixture" });
  await expect(editor).toHaveValue("Original note"); await editor.fill("My local thoughts");
  await expect(page.getByRole("status").filter({ hasText: "Saved on this device. Sync" })).toBeVisible();
  await page.reload(); await open(); await expect(editor).toHaveValue("My local thoughts");
  state.setNotesOnline(false); await page.getByRole("button", { name: "Sync note", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your library couldn’t be reached" })).toBeVisible();
  state.setNotesOnline(true); state.setNote("Changed on another device"); await page.getByRole("button", { name: "Sync note", exact: true }).click();
  await expect(page.locator(".yomi-note-conflict")).toContainText("Changed on another device"); expect(state.noteWrites).toEqual([]);
  await page.getByRole("button", { name: "Replace library note with mine", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved to your library and this device." })).toBeVisible(); expect(state.noteWrites).toEqual(["My local thoughts"]);
});
test("touch swipes change read and bookmark state without opening the chapter", async ({ page, context }) => {
  await page.setViewportSize({ width: 520, height: 900 });
  const state = await fixture(page); await page.goto("/manga/10002");
  const row = page.locator(".yomi-chapter-row").filter({ has: page.getByRole("button", { name: "Actions for Chapter 51", exact: true }) });
  await row.scrollIntoViewIfNeeded(); const bounds = (await row.boundingBox())!;
  const session = await context.newCDPSession(page);
  const swipe = async (delta: number) => {
    const x = bounds.x + 190, y = bounds.y + bounds.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (const fraction of [0.25, 0.5, 0.75, 1]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + delta * fraction, y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(95); await expect.poll(() => state.chapters[50].isRead).toBe(true);
  await expect(row).toHaveAttribute("aria-busy", "false");
  await swipe(-95); await expect.poll(() => state.chapters[50].isBookmarked).toBe(true);
  await expect(page).toHaveURL(/\/manga\/10002$/); await session.detach();
});
