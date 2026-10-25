import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";

async function sourceFixture(page: Page, fail = false) {
  let initialized = false;
  let failing = fail;
  let fetches = 0;
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, serverBaseUrl: "http://127.0.0.1:45679", connectionStatus: "connected" } })));
  await page.route("**/api/graphql", async (route) => {
    const { query, variables = {}, operationName } = route.request().postDataJSON();
    const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetMangaDetails") {
      const base = await mockSdk.GetMangaDetails({ id: 10002 });
      data = { manga: { ...base.manga, initialized, title: "Newly discovered story", status: initialized ? "ONGOING" : "UNKNOWN", author: initialized ? "A story author" : null, description: initialized ? "A complete description fetched from the source." : null, genre: initialized ? ["Adventure"] : [] } };
    } else if (name === "FetchMangaDetails") {
      fetches++;
      if (failing) return route.fulfill({ status: 503, json: { errors: [{ message: "Source temporarily unavailable" }] } });
      initialized = true;
      data = { fetchManga: { manga: { id: 10002, initialized } } };
    } else if (name === "FetchChapters") data = { fetchChapters: { chapters: [{ id: 20002, name: "A chapter ready to read", chapterNumber: 1, sourceOrder: 1, isRead: false, isBookmarked: false, isDownloaded: false, scanlator: "Source", uploadDate: "2026-10-25" }] } };
    else {
      const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
      data = method ? await method(variables) : { __typename: "Query" };
    }
    await route.fulfill({ json: { data } });
  });
  return { fetches: () => fetches, recover: () => { failing = false; } };
}

test("a new source title loads its author, description and status without blocking chapters", async ({ page }) => {
  const source = await sourceFixture(page);
  await page.goto("/manga/10002");
  await expect(page.getByText("A story author", { exact: true })).toBeVisible();
  await expect(page.getByText("A complete description fetched from the source.", { exact: true })).toBeVisible();
  await expect(page.getByText("ONGOING", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^A chapter ready to read/ })).toBeVisible();
  await expect(page.getByText("UNKNOWN", { exact: true })).toHaveCount(0);
  expect(source.fetches()).toBe(1);
  await page.reload();
  await expect(page.getByText("A story author", { exact: true })).toBeVisible();
  expect(source.fetches()).toBe(1);
});

test("detail-fetch failure leaves chapters available and offers a working retry", async ({ page }) => {
  const source = await sourceFixture(page, true);
  await page.goto("/manga/10002");
  await expect(page.getByRole("button", { name: "Retry book details", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^A chapter ready to read/ })).toBeVisible();
  expect(source.fetches()).toBe(1);
  source.recover();
  await page.getByRole("button", { name: "Retry book details", exact: true }).click();
  await expect(page.getByText("A story author", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry book details", exact: true })).toHaveCount(0);
  expect(source.fetches()).toBe(2);
});
