import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
import AxeBuilder from "@axe-core/playwright";
const backend = "http://127.0.0.1:45679";
async function fixture(page: Page, options: { unavailable?: boolean; reject?: boolean } = {}) {
  const settings = { downloadAsCbz: false, maxSourcesInParallel: 7, autoDownloadNewChapters: false, autoDownloadNewChaptersLimit: 0, excludeEntryWithUnreadChapters: true, autoDownloadIgnoreReUploads: false };
  const writes: Record<string, unknown>[] = [];
  await page.addInitScript((backend) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, connectionStatus: "connected", mockMode: false } })); }, backend);
  await page.route("**/api/graphql", async (route) => {
    const { query, operationName, variables = {} } = route.request().postDataJSON(); const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] || "ConnectionTest";
    let data: unknown;
    if (name === "GetServerDownloadPreferences") { if (options.unavailable) return route.fulfill({ json: { errors: [{ message: "Field not supported by fixture library" }] } }); data = { settings }; }
    else if (name === "SetServerDownloadPreferences") { writes.push(variables.input.settings); if (!options.reject) Object.assign(settings, variables.input.settings); data = { setSettings: { settings } }; }
    else { const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  return { settings, writes };
}
test("library format and source concurrency controls round-trip actual supported values", async ({ page }) => {
  const state = await fixture(page); await page.goto("/settings/offline");
  await expect(page.getByRole("combobox", { name: "Library sources at once", exact: true })).toContainText("7");
  await page.getByRole("checkbox", { name: "Save library downloads as CBZ archives", exact: true }).check();
  await expect.poll(() => state.settings.downloadAsCbz).toBe(true);
  await page.getByRole("combobox", { name: "Library sources at once", exact: true }).click(); await page.getByRole("option", { name: "5", exact: true }).click();
  await expect.poll(() => state.settings.maxSourcesInParallel).toBe(5);
  expect(state.writes).toEqual([{ downloadAsCbz: true }, { maxSourcesInParallel: 5 }]);
});
test("automatic library downloads get a real positive limit and independent backlog choices", async ({ page }) => {
  const state = await fixture(page); await page.goto("/settings/offline");
  await page.getByRole("checkbox", { name: "Download new chapters automatically", exact: true }).check();
  await expect.poll(() => state.settings.autoDownloadNewChaptersLimit).toBe(5);
  await page.getByRole("checkbox", { name: "Skip books with an unread backlog", exact: true }).uncheck();
  await expect.poll(() => state.settings.excludeEntryWithUnreadChapters).toBe(false);
  await page.getByRole("checkbox", { name: "Skip re-uploaded chapters", exact: true }).check();
  await expect.poll(() => state.settings.autoDownloadIgnoreReUploads).toBe(true);
});
test("unconfirmed library settings keep their prior value and expose recovery", async ({ page }) => {
  await fixture(page, { reject: true }); await page.goto("/settings/offline");
  await page.getByRole("checkbox", { name: "Save library downloads as CBZ archives", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "The library couldn’t save this change" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Save library downloads as CBZ archives", exact: true })).not.toBeChecked();
});
test("unsupported library options do not block device storage and reading-data preferences", async ({ page }) => {
  await fixture(page, { unavailable: true }); await page.goto("/settings/offline");
  await expect(page.getByRole("button", { name: "Retry library download options", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Connection cost", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Offline Storage Space", exact: true })).toBeVisible();
});
test("reading data preferences persist and the storage page remains accessible", async ({ page }) => {
  await fixture(page); await page.goto("/settings/offline");
  await page.getByRole("combobox", { name: "Connection cost", exact: true }).click(); await page.getByRole("option", { name: "Treat as metered", exact: true }).click();
  await page.getByRole("checkbox", { name: "Load ahead on unmetered connections only", exact: true }).check();
  await page.getByRole("combobox", { name: "Pages to load ahead", exact: true }).click(); await page.getByRole("option", { name: "4", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Connection cost", exact: true })).toContainText("Treat as metered");
  await expect(page.getByRole("combobox", { name: "Pages to load ahead", exact: true })).toContainText("4");
  await expect(page.getByRole("checkbox", { name: "Load ahead on unmetered connections only", exact: true })).toBeChecked();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
