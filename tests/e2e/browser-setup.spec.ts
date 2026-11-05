import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const server = "http://127.0.0.1:45673";
const previous = "http://127.0.0.1:45674";
const marker = "8ba96cab-7676-4c6c-bbe2-d542a49391e9";

for (const [palette, mode, width] of [["ember", "dark", 1440], ["moonstone", "light", 390]] as const) {
  test(`browser setup remains accessible without a server in ${mode} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(({ palette, mode }) => {
      localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, colorPalette: palette, themeMode: mode, autoDownloadCount: 0, backupIntervalHours: 0 } }));
    }, { palette, mode });
    await page.route("**/api/graphql", (route) => route.abort("connectionrefused"));
    await page.route("https://api.github.com/repos/Yumekaz/Yomikura/releases/latest", (route) => route.fulfill({ json: { assets: [] } }));
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "Your browser. Your reading room.", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Yomikura Desktop", exact: true })).toHaveAttribute("href", "https://github.com/Yumekaz/Yomikura/releases/latest");
    await expect(page.getByRole("navigation", { name: "Browser setup steps" }).getByRole("link")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Download Suwayomi", exact: true })).toHaveAttribute("href", "https://github.com/Suwayomi/Suwayomi-Server/releases/latest");
    await page.getByText("Which download should I choose?", { exact: true }).click();
    await expect(page.getByText(/The Windows ZIP includes Java/)).toBeVisible();
    await expect(page.getByText(/For a separate library, create an empty folder/)).toBeVisible();
    await page.getByRole("link", { name: "I already have Suwayomi", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your Suwayomi address", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Use the usual address", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Your Suwayomi address", exact: true })).toHaveValue("http://127.0.0.1:4567");
    await page.getByText("Another device, a hosted website, or a connection problem?", { exact: true }).click();
    await expect(page.getByText("Localhost means this device.", { exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")).map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `.cache/browser-setup-guide/setup-${mode}-${width}.png`, fullPage: true });
  });
}

test("guide connections retain previous profiles, explain failure and succeed after retry", async ({ page }) => {
  let online = false;
  await page.addInitScript(({ previous }) => {
    localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: previous, mockMode: false, profiles: [{ id: "retained", name: "My existing library", url: previous }], activeProfileId: "retained", autoDownloadCount: 0, backupIntervalHours: 0 } }));
  }, { previous });
  await page.route("**/api/graphql", async (route) => {
    if (!online || !route.request().url().startsWith(server)) return route.abort("connectionrefused");
    const { operationName } = route.request().postDataJSON();
    const data = operationName === "YomikuraLibraryIdentity" ? { metas: { nodes: [{ key: "yomikura.library.identity.v1", value: marker }] } } : { __typename: "Query" };
    return route.fulfill({ json: { data } });
  });
  await page.route("https://api.github.com/repos/Yumekaz/Yomikura/releases/latest", (route) => route.fulfill({ json: { assets: [] } }));
  await page.goto("/setup");
  await page.getByRole("textbox", { name: "Your Suwayomi address", exact: true }).fill(server);
  await page.getByRole("button", { name: "Connect my library", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your other libraries are still saved.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.profiles)).toEqual(expect.arrayContaining([{ id: "retained", name: "My existing library", url: previous }]));
  online = true;
  await page.getByRole("button", { name: "Connect my library", exact: true }).click();
  await expect(page.getByText("Your current library is connected.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose a store", exact: true })).toHaveAttribute("href", "/browse/extension-repos");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-library-sessions-v1") ?? "{}")["http://127.0.0.1:45673"]?.marker)).toBe(marker);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("yomikura-settings")!).state.profiles.length)).toBe(2);
  await expect(page.getByRole("button", { name: "Discover books", exact: true })).toBeVisible();
});
