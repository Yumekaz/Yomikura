import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const palette of ["ember", "sakura", "forest", "moonstone"]) {
  test(`offline notice is readable in the ${palette} light theme`, async ({ page }) => {
    await page.addInitScript((colorPalette) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: false, themeMode: "light", colorPalette, serverBaseUrl: "http://127.0.0.1:45679" } })), palette);
    await page.route("**/api/graphql", (route) => route.abort("connectionrefused"));
    await page.goto("/settings/connection");
    const notice = page.locator(".yomi-offline-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCSS("color", "rgb(112, 71, 19)");
    const violations = (await new AxeBuilder({ page }).include("#main-content").analyze()).violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(violations).toEqual([]);
  });
}
