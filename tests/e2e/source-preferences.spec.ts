import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installTrackerFixture, trackerFixture } from "./fixtures/tracking";
test.use({ serviceWorkers: "block" });
const id = "6247824327199706550";
async function preferences(page: Page, reject = false) {
  await installTrackerFixture(page, [trackerFixture()]);
  const fields = [
    { __typename: "EditTextPreference", key: "internal", title: "Hidden preference", visible: false, enabled: true, valueString: "hidden" },
    { __typename: "MultiSelectListPreference", key: "languages", title: "Preferred languages", visible: true, enabled: true, entries: ["English", "Japanese"], entryValues: ["en", "ja"], valueStrings: ["en"] },
    { __typename: "SwitchPreference", key: "quality", title: "High quality", visible: true, enabled: true, valueBool: false },
    { __typename: "ListPreference", key: "format", title: "Page format", visible: true, enabled: false, entries: ["Original"], entryValues: ["original"], valueString: "original" },
    { __typename: "EditTextPreference", key: "password", title: "Source password", visible: true, enabled: true, valueString: "fixture-secret" },
  ];
  const changes: any[] = [];
  await page.route("**/api/graphql", async (route) => {
    const request = route.request().postDataJSON(); let data;
    if (request.operationName === "GetSourcePreferences") data = { source: { id, name: "Source settings fixture", isConfigurable: true, preferences: fields } };
    else if (request.operationName === "UpdateSourcePreference") { const input = request.variables.input; changes.push(input); const field = fields[input.change.position]; if (!reject) { if (input.change.multiSelectState) field.valueStrings = [...input.change.multiSelectState].reverse(); if (input.change.switchState !== undefined) field.valueBool = input.change.switchState; if (input.change.editTextState !== undefined) field.valueString = input.change.editTextState; } data = { updateSourcePreference: { source: { id }, preferences: fields } }; }
    else return route.fallback(); await route.fulfill({ json: { data } });
  });
  return { changes, fields };
}
test("multi-choice source preferences retain hidden positions and confirm the full set", async ({ page }) => {
  const state = await preferences(page); await page.goto(`/browse/source/${id}/settings`);
  await expect(page.getByText("Hidden preference", { exact: true })).toHaveCount(0); await page.getByRole("checkbox", { name: "Japanese", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Japanese", exact: true })).toBeChecked(); await expect(page.getByText("Source preference confirmed.", { exact: true })).toBeVisible();
  expect(state.changes[0]).toEqual({ source: id, change: { position: 1, multiSelectState: ["en", "ja"] } });
  await expect(page.getByRole("combobox", { name: "Page format", exact: true })).toBeDisabled();
});
test("unconfirmed source values keep the draft and previous preference available", async ({ page }) => {
  await preferences(page, true); await page.goto(`/browse/source/${id}/settings`); await page.getByRole("checkbox", { name: "High quality", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("wasn’t confirmed"); await expect(page.getByRole("checkbox", { name: "High quality", exact: true })).not.toBeChecked();
  await page.getByLabel("Source password", { exact: true }).fill("new-private-value"); await page.getByRole("button", { name: "Save Source password", exact: true }).click(); await expect(page.getByLabel("Source password", { exact: true })).toHaveValue("new-private-value");
});
test("source preference controls are labelled and sensitive values remain masked", async ({ page }) => {
  await preferences(page); await page.goto(`/browse/source/${id}/settings`); await expect(page.getByLabel("Source password", { exact: true })).toHaveAttribute("type", "password"); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("extension catalogs load beyond the first page and expose publisher and content state", async ({ page }) => {
  await installTrackerFixture(page, [trackerFixture()]); const cursors: unknown[] = [];
  const row = (name: string) => ({ pkgName: name, name, lang: "en", isInstalled: false, isNsfw: false, isObsolete: name === "Third extension", contentWarning: name === "Third extension" ? "MIXED" : "SAFE", hasUpdate: false, versionName: "1.0", extensionStore: { name: "Example publisher", indexUrl: "https://extensions.example/repo.json" } });
  await page.route("**/api/graphql", async (route) => { const request = route.request().postDataJSON(); if (request.operationName !== "GetExtensions") return route.fallback(); const after = request.variables?.after; cursors.push(after ?? null); await route.fulfill({ json: { data: { extensions: { totalCount: 3, nodes: after ? [row("Third extension")] : [row("First extension"), row("Second extension")], pageInfo: { hasNextPage: !after, endCursor: after ? null : "next" } } } } }); });
  await page.goto("/extensions"); await expect(page.getByText("Third extension", { exact: true })).toBeVisible(); await expect(page.getByText("3 total", { exact: true })).toBeVisible(); await expect(page.getByText("Mixed content", { exact: true })).toBeVisible(); await expect(page.getByText("No longer listed", { exact: true })).toBeVisible(); expect([...new Set(cursors)]).toEqual([null, "next"]);
});
