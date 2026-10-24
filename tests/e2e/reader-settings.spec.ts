import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import { chapterConnection } from "./fixtures/chapterConnection";

const first = "http://127.0.0.1:45677";
const second = "http://127.0.0.1:45678";
const settingsKey = (server: string) => JSON.stringify([JSON.stringify(["live", server]), "42"]);
const remembered = (page: Page) => page.getByRole("button", { name: "Remember reader settings for this manga", exact: true });
const pagedImage = (page: Page) => page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true });

async function fixture(page: Page, earlier = false) {
  await page.addInitScript(({ first, second, earlier }) => {
    if (localStorage.getItem("yomikura-settings")) return;
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: {
      serverBaseUrl: first, mockMode: false, connectionStatus: "connected", readerMode: "WEBTOON", pageSpread: "SINGLE", autoDownloadCount: 0,
      autoDeleteReadChapters: false, infiniteChapterReading: false, pageTransition: "none", activeProfileId: "first",
      profiles: [{ id: "first", name: "First fixture", url: first }, { id: "second", name: "Second fixture", url: second }],
      mangaSettingsOverrides: earlier ? { 42: { readerMode: "RTL", imageFilters: { grayscale: 35 } } } : {},
    } }));
  }, { first, second, earlier });
  const records = new Map([first, second].map((server) => [server, { isRead: false, lastPageRead: 0 }]));
  await page.route("**/api/graphql", async (route) => {
    const server = new URL(route.request().url()).origin;
    if (!records.has(server)) return route.abort("connectionrefused");
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetChapter") data = { chapter: { id: 12, name: "Reader settings chapter", mangaId: 42, chapterNumber: 1, sourceOrder: 1, pageCount: 1,
      ...records.get(server), manga: { title: server === first ? "First server title" : "Second server title", chapters: { edges: [{ node: { id: 12, chapterNumber: 1 } }] } } } };
    else if (name === "FetchChapterPages") data = { fetchChapterPages: { pages: [`${server}/api/v1/manga/42/chapter/1/page/0`] } };
    else if (name === "GetReadingChapters") data = chapterConnection(42, [{ id: 12, chapterNumber: 1, name: "Reader settings chapter", ...records.get(server) }]);
    else if (name === "UpdateChapterProgress") {
      Object.assign(records.get(server)!, variables.input.patch);
      data = { updateChapter: { chapter: { id: 12, ...records.get(server) } } };
    } else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  await page.route("**/api/v1/manga/42/chapter/1/page/0", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#254c45"/></svg>' }));
}
async function openReader(page: Page, owner: "First" | "Second") {
  await page.goto("/reader/12");
  await expect(page.getByText(`${owner} server title`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
}
async function switchServer(page: Page, id: "first" | "second") {
  await page.goto("/settings/reader");
  await page.getByRole("combobox", { name: "Server profile", exact: true }).selectOption(id);
}
async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings") || "{}").state);
}

test("title controls retain their own values across backend switches, reload and clear", async ({ page }, info) => {
  await fixture(page); await openReader(page, "First");
  await remembered(page).click();
  await page.getByRole("button", { name: "RTL", exact: true }).click();
  await page.getByRole("combobox", { name: "Page transition", exact: true }).selectOption("fade");
  await page.getByRole("combobox", { name: "Auto-download ahead", exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("slider", { name: "Grayscale effect", exact: true }).fill("65");
  await page.getByRole("button", { name: "Fixed page crop", exact: true }).click();
  await expect(pagedImage(page)).toHaveCSS("filter", /grayscale\(0\.65\)/);
  const firstSaved = await saved(page);
  expect(firstSaved).toMatchObject({ readerMode: "WEBTOON", pageTransition: "none", cropBorders: false, autoDownloadCount: 0, imageFilters: { grayscale: 0 } });
  expect(firstSaved.mangaSettingsOverrides[settingsKey(first)]).toMatchObject({ readerMode: "RTL", pageTransition: "fade", cropBorders: true, autoDownloadCount: 3, imageFilters: { grayscale: 65 } });

  await switchServer(page, "second"); await openReader(page, "Second");
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-reader-chapter="12"]')).toHaveCount(1);
  await remembered(page).click();
  await page.getByRole("button", { name: "LTR", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("slider", { name: "Invert colors", exact: true }).fill("20");
  await page.reload();
  await expect(pagedImage(page)).toHaveCSS("filter", /invert\(0\.2\)/);
  await expect(pagedImage(page)).toHaveCSS("filter", /grayscale\(0\)/);

  await switchServer(page, "first"); await openReader(page, "First");
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Page transition", exact: true })).toHaveValue("fade");
  await expect(pagedImage(page)).toHaveCSS("filter", /grayscale\(0\.65\)/);
  await remembered(page).click();
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-reader-chapter="12"]')).toHaveCount(1);
  const remaining = (await saved(page)).mangaSettingsOverrides;
  expect(remaining[settingsKey(first)]).toBeUndefined();
  expect(remaining[settingsKey(second)]).toMatchObject({ readerMode: "LTR", imageFilters: { invert: 20 } });
  await page.screenshot({ path: info.outputPath("reader-settings-profile-isolation.png") });
});

test("earlier unowned settings wait for a confirmed server choice and remain recoverable", async ({ page }) => {
  await fixture(page, true); await openReader(page, "First");
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-reader-chapter="12"]')).toHaveCount(1);
  await page.goto("/settings/reader");
  const recover = page.getByRole("button", { name: "Use earlier settings on this server", exact: true });
  await recover.click();
  let dialog = page.getByRole("alertdialog", { name: "Restore earlier title settings?", exact: true });
  await expect(dialog).toContainText(first);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).mangaSettingsOverrides[settingsKey(first)]).toBeUndefined();
  await recover.click();
  dialog = page.getByRole("alertdialog", { name: "Restore earlier title settings?", exact: true });
  await dialog.getByRole("button", { name: "Apply earlier settings", exact: true }).click();
  await expect(recover).toHaveCount(0);
  await openReader(page, "First");
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "true");
  await expect(pagedImage(page)).toHaveCSS("filter", /grayscale\(0\.35\)/);
  await switchServer(page, "second"); await openReader(page, "Second");
  await expect(remembered(page)).toHaveAttribute("aria-pressed", "false");
  expect((await saved(page)).mangaSettingsOverrides[42]).toMatchObject({ readerMode: "RTL", imageFilters: { grayscale: 35 } });
});
