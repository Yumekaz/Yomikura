import { expect, test } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
test("discovery feed paginates beyond 100, keeps failed pages retryable, and separates publication dates", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:45679", mockMode: false, connectionStatus: "connected" } })));
  let failNext = true; const requests: any[] = [];
  const chapter = (id: number) => ({ id, name: `Discovery ${id}`, chapterNumber: id, isRead: false, lastPageRead: 0, uploadDate: "2000-01-01T00:00:00Z", fetchedAt: String(Date.now() - id * 1000), scanlator: null, mangaId: 42, manga: { id: 42, title: "Discovery fixture", thumbnailUrl: null, inLibraryAt: String(Date.now() - 86400000) } });
  await page.route("**/api/graphql", async (route) => {
    const { query, operationName, variables = {} } = route.request().postDataJSON(); const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1]; let data: unknown;
    if (name === "GetUpdates") {
      requests.push(variables);
      if (variables.after && failNext) return route.fulfill({ status: 503, json: { errors: [{ message: "Temporary next-page failure" }] } });
      const nodes = variables.after ? [chapter(100), ...[101, 102, 103, 104, 105].map(chapter)] : Array.from({ length: 100 }, (_, index) => chapter(index + 1));
      if (!variables.after) nodes[1] = { ...nodes[1], fetchedAt: "1" };
      data = { chapters: { pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? null : "next-100" }, edges: nodes.map((node) => ({ node })) } };
    } else { const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name!]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/updates"); await expect(page.getByText("99 chapters loaded", { exact: true })).toBeVisible();
  expect(requests[0].order[0].by).toBe("FETCHED_AT"); await expect(page.getByText("Discovery 1", { exact: true })).toBeVisible(); await expect(page.getByText("Discovery 2", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Load older chapters", exact: true }).click(); await expect(page.getByRole("button", { name: "Retry updates", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Discovery 1", { exact: true })).toBeVisible(); failNext = false;
  await page.getByRole("button", { name: "Retry updates", exact: true }).click(); await expect(page.getByText("104 chapters loaded", { exact: true })).toBeVisible();
  await expect(page.getByText("Discovery 105", { exact: true })).toBeVisible(); await expect(page.getByText("Discovery 100", { exact: true })).toHaveCount(1);
  await page.getByLabel("Update date", { exact: true }).selectOption("published"); await expect.poll(() => requests[requests.length - 1].order[0].by).toBe("UPLOAD_DATE");
  await expect(page.getByText("100 chapters loaded", { exact: true })).toBeVisible(); await expect(page.getByText("Discovery 2", { exact: true })).toBeVisible();
});
