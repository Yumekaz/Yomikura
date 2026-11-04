import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { mockSdk } from "../../src/api/graphql/mockSdk";

for (const palette of ["ember", "sakura", "forest", "moonstone"]) {
  test(`server update guidance stays readable and still in light ${palette}`, async ({ page }) => {
    await page.addInitScript((palette) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: {
      mockMode: false, serverBaseUrl: "http://127.0.0.1:45679", connectionStatus: "connected", themeMode: "light", colorPalette: palette,
    } })), palette);
    await page.route("**/api/graphql", async (route) => {
      const { query, operationName, variables = {} } = route.request().postDataJSON();
      const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
      const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name];
      const data = query.includes("aboutServer") ? { aboutServer: { version: "v2.3.2243" } } : method ? await method(variables) : { __typename: "Query" };
      await route.fulfill({ json: { data } });
    });
    await page.route("https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest", (route) => route.fulfill({ json: { tag_name: "v2.4.2366" } }));
    await page.goto("/settings/about");
    const notice = page.getByRole("status", { name: "Server update", exact: true });
    await expect(notice).toContainText("New Suwayomi release: v2.4.2366");
    await expect(notice).toContainText("Yomikura’s local engine updates through app releases.");
    await notice.scrollIntoViewIfNeeded();
    await expect(notice).toHaveCSS("animation-name", "none");
    await expect(notice.getByRole("link", { name: "View release", exact: true })).toHaveAttribute("href", "https://github.com/Suwayomi/Suwayomi-Server/releases/latest");
    const audit = await new AxeBuilder({ page }).include('[aria-label="Server update"]').withRules(["color-contrast"]).analyze();
    expect(audit.violations).toEqual([]);
    await mkdir(".cache/reader-release-review", { recursive: true });
    await notice.screenshot({ path: `.cache/reader-release-review/server-update-light-${palette}.png` });
  });
}
