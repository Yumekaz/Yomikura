import { expect, test, type Page } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
const first = "http://127.0.0.1:45677", second = "http://127.0.0.1:45678";
test.use({ serviceWorkers: "block" });
async function fixture(page: Page, options: { reject?: boolean; running?: boolean; delayedPolicy?: boolean; schedule?: boolean; delayedStatus?: boolean } = {}) {
  const libraries = new Map([first, second].map((url, index) => [url, { settings: { globalUpdateInterval: index ? 24 : 12, excludeUnreadChapters: false, excludeNotStarted: false, excludeCompleted: false, updateMangas: false }, categories: { nodes: [{ id: 0, name: "Default", order: 0, default: false, includeInUpdate: "UNSET", includeInDownload: "UNSET" }, { id: 1, name: "Reading", order: 1, default: false, includeInUpdate: "UNSET", includeInDownload: "UNSET" }] }, running: !!options.running }]));
  const writes: { url: string; operation: string; patch: any }[] = []; let release!: () => void, waiting = false;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.addInitScript(({ first, second, schedule }) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: first, mockMode: false, connectionStatus: "connected", libraryUpdateIntervalHours: schedule ? 6 : 0, activeProfileId: "first", profiles: [{ id: "first", name: "First library", url: first }, { id: "second", name: "Second library", url: second }] } })); }, { first, second, schedule: options.schedule });
  await page.route("**/api/graphql", async (route) => {
    const url = new URL(route.request().url()).origin, library = libraries.get(url); if (!library) return route.abort("connectionrefused");
    const { query, operationName, variables = {} } = route.request().postDataJSON(), name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1]; let data: unknown;
    const jobsInfo = () => ({ isRunning: library.running, finishedJobs: library.running ? 1 : 3, totalJobs: 3, skippedMangasCount: 2 });
    if (name === "GetLibraryPolicy") data = library;
    else if (name === "GetCategories") data = { categories: library.categories };
    else if (name === "SetLibraryPolicy") {
      writes.push({ url, operation: name, patch: variables.input.settings }); if (url === first && options.delayedPolicy) { waiting = true; await pending; }
      if (!options.reject) Object.assign(library.settings, variables.input.settings); data = { setSettings: { settings: library.settings } };
    } else if (name === "SetCollectionPolicy") { const item = library.categories.nodes.find((item) => item.id === variables.input.id)!; writes.push({ url, operation: name, patch: variables.input }); if (!options.reject) Object.assign(item, variables.input.patch); data = { updateCategory: { category: item } }; }
    else if (name === "GetLibraryUpdateStatus") { if (url === first && options.delayedStatus) { waiting = true; await pending; } data = { libraryUpdateStatus: { jobsInfo: jobsInfo() } }; }
    else if (name === "UpdateLibrary") { writes.push({ url, operation: name, patch: variables.input }); library.running = true; data = { updateLibrary: { updateStatus: { jobsInfo: jobsInfo() } } }; }
    else if (name === "StopLibraryUpdate") { writes.push({ url, operation: name, patch: variables.input }); if (!options.reject) library.running = false; data = { updateStop: { clientMutationId: options.reject ? "unconfirmed" : variables.input.clientMutationId } }; }
    else { const method = (mockSdk as unknown as Record<string, (value: unknown) => Promise<unknown>>)[name]; data = method ? await method(variables) : { __typename: "Query" }; }
    await route.fulfill({ json: { data } });
  });
  return { libraries, writes, release, waiting: () => waiting };
}
test("library policies and collection defaults are confirmed independently", async ({ page }) => {
  const data = await fixture(page); await page.goto("/settings/library");
  await page.getByRole("checkbox", { name: "Skip books with unread chapters", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Skip books with unread chapters", exact: true })).toBeChecked();
  await expect.poll(() => data.libraries.get(first)!.settings.excludeUnreadChapters).toBe(true);
  await page.getByRole("checkbox", { name: "Refresh book information during updates", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Refresh book information during updates", exact: true })).toBeChecked();
  await expect.poll(() => data.libraries.get(first)!.settings.updateMangas).toBe(true);
  await page.getByRole("checkbox", { name: "Add new books to Reading by default", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Add new books to Reading by default", exact: true })).toBeChecked();
  await expect.poll(() => data.libraries.get(first)!.categories.nodes[1].default).toBe(true);
  await page.getByRole("combobox", { name: "Automatic updates for Reading", exact: true }).click(); await page.getByRole("option", { name: "Exclude", exact: true }).click();
  await expect.poll(() => data.libraries.get(first)!.categories.nodes[1].includeInUpdate).toBe("EXCLUDE");
});
test("an HTTP-success policy mismatch keeps the prior preference and offers recovery", async ({ page }) => {
  await fixture(page, { reject: true }); await page.goto("/settings/library"); await page.getByRole("checkbox", { name: "Skip completed publications", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "couldn’t confirm this change" })).toBeVisible(); await expect(page.getByRole("checkbox", { name: "Skip completed publications", exact: true })).not.toBeChecked();
});
test("update progress remains available after navigation and cancellation waits for confirmation", async ({ page }) => {
  const data = await fixture(page, { running: true }); await page.goto("/settings/library");
  const notice = page.getByRole("complementary", { name: "Library update activity", exact: true }); await expect(notice.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Appearance", exact: true }).click(); await expect(notice).toBeVisible(); await notice.getByRole("button", { name: "Stop updates", exact: true }).click();
  await expect(notice).toHaveCount(0); expect(data.writes.some((write) => write.operation === "StopLibraryUpdate")).toBe(true);
});
test("an unconfirmed cancellation retains the progress display", async ({ page }) => {
  await fixture(page, { running: true, reject: true }); await page.goto("/settings/library"); const notice = page.getByRole("complementary", { name: "Library update activity", exact: true });
  await notice.getByRole("button", { name: "Stop updates", exact: true }).click(); await expect(notice.getByRole("alert")).toContainText("wasn’t confirmed"); await expect(notice).toBeVisible();
});
test("a delayed first-library setting response cannot replace another profile's values", async ({ page }) => {
  const data = await fixture(page, { delayedPolicy: true }); await page.goto("/settings/library"); await page.getByRole("checkbox", { name: "Skip completed publications", exact: true }).click(); await expect.poll(data.waiting).toBe(true);
  await page.getByRole("combobox", { name: "Server profile", exact: true }).click(); await page.getByRole("option", { name: "Second library", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Library automatic checks", exact: true })).toContainText("Every 24 hours"); data.release();
  await expect(page.getByRole("checkbox", { name: "Skip completed publications", exact: true })).not.toBeChecked();
});
test("scheduled requests follow the selected backend after a delayed status response", async ({ page }) => {
  const data = await fixture(page, { schedule: true, delayedStatus: true }); await page.goto("/settings/library"); await expect.poll(data.waiting).toBe(true);
  await page.getByRole("combobox", { name: "Server profile", exact: true }).click(); await page.getByRole("option", { name: "Second library", exact: true }).click();
  await expect.poll(() => data.writes.filter((write) => write.operation === "UpdateLibrary").length).toBe(1); data.release();
  expect(data.writes.filter((write) => write.operation === "UpdateLibrary").map((write) => write.url)).toEqual([second]);
});
