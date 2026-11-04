import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installTrackerFixture, trackerFixture } from "./fixtures/tracking";

test.use({ serviceWorkers: "block" });

async function extensionFixture(page: Page) {
  await installTrackerFixture(page, [trackerFixture()]);
  const extensions = [
    { pkgName: "first", name: "First source", isInstalled: true, hasUpdate: true },
    { pkgName: "second", name: "Second source", isInstalled: true, hasUpdate: true },
    { pkgName: "available", name: "Available source", isInstalled: false, hasUpdate: true },
  ].map((extension) => ({ ...extension, lang: "en", isNsfw: false, isObsolete: false, contentWarning: "SAFE", versionName: "2.0", iconUrl: "", extensionStore: { name: "Chosen publisher", indexUrl: "https://publisher.example/store.json" } }));
  const state = { extensions, checks: 0, actions: [] as any[], failCheck: false };
  await page.route("**/api/graphql", async (route) => {
    const { operationName, variables = {} } = route.request().postDataJSON();
    let data: unknown;
    if (operationName === "GetExtensionStores") data = { extensionStores: { totalCount: 1, nodes: [{ name: "Chosen publisher", indexUrl: "https://publisher.example/store.json" }] } };
    else if (operationName === "FetchExtensionCatalog") {
      state.checks += 1;
      if (state.failCheck) return route.fulfill({ json: { errors: [{ message: "Publisher unavailable" }] } });
      data = { fetchExtensions: { extensions: extensions.map(({ pkgName }) => ({ pkgName })) } };
    } else if (operationName === "GetExtensions") data = { extensions: { totalCount: extensions.length, nodes: extensions, pageInfo: { hasNextPage: false, endCursor: null } } };
    else if (operationName === "GetExtensionState") data = { extension: extensions.find((extension) => extension.pkgName === variables.pkgName) };
    else if (operationName === "ToggleExtensionInstall") {
      state.actions.push(variables.input);
      const extension = extensions.find((item) => item.pkgName === variables.input.id)!;
      if (variables.input.patch.update) extension.hasUpdate = false;
      data = { updateExtension: { extension } };
    } else return route.fallback();
    await route.fulfill({ json: { data } });
  });
  return state;
}

test("source updates are discovered from the library and install only after an explicit action", async ({ page }) => {
  const state = await extensionFixture(page);
  await page.goto("/library");
  const notice = page.getByRole("status", { name: "Extension updates", exact: true });
  await expect(notice).toContainText("2 source extension updates are available");
  expect(state.checks).toBe(1);
  expect(state.actions).toEqual([]);
  await notice.getByRole("link", { name: "Review updates", exact: true }).click();
  await expect(page.getByRole("button", { name: "Updates (2)", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Available source", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Update all (2)", exact: true }).click();
  await expect(page.getByText("Extensions updated", { exact: true })).toBeVisible();
  expect(state.actions).toEqual([{ id: "first", patch: { update: true } }, { id: "second", patch: { update: true } }]);
  await expect(page.getByRole("button", { name: "Updates (0)", exact: true })).toBeVisible();
  await page.goto("/library");
  await expect(notice).toHaveCount(0);
  expect(state.checks).toBe(1);
});

test("a dismissed source update notice leaves updates reachable and failed checks retain the known list", async ({ page }) => {
  const state = await extensionFixture(page);
  await page.goto("/library");
  await page.getByRole("button", { name: "Dismiss extension update notice", exact: true }).click();
  await expect(page.getByRole("status", { name: "Extension updates", exact: true })).toHaveCount(0);
  await page.goto("/extensions?view=updates");
  await expect(page.getByText("First source", { exact: true })).toBeVisible();
  state.failCheck = true;
  await page.getByRole("button", { name: "Refresh catalog", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Catalog refresh failed");
  await expect(page.getByText("First source", { exact: true })).toBeVisible();
  expect(state.actions).toEqual([]);
  state.failCheck = false;
  await page.getByRole("button", { name: "Refresh catalog", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Catalog refreshed" })).toBeVisible();
});

test("source update controls fit a compact light reading room and remain accessible", async ({ page }) => {
  await extensionFixture(page);
  await page.addInitScript(() => { const settings = JSON.parse(localStorage.getItem("yomikura-settings")!); settings.state.themeMode = "light"; settings.state.colorPalette = "moonstone"; localStorage.setItem("yomikura-settings", JSON.stringify(settings)); });
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/extensions?view=updates");
  await expect(page.getByRole("button", { name: "Updates (2)", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(violations).toEqual([]);
});
