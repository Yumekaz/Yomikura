import { expect, test } from "@playwright/test";

async function enterDemo(page: import("@playwright/test").Page) {
  await page.goto("/library");
  const demoButton = page.getByRole("button", { name: "Explore Demo Library" });
  await expect(demoButton).toBeVisible({ timeout: 15_000 });
  await demoButton.click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
}

test("desktop shell keeps one clear navigation hierarchy", async ({ page }) => {
  await enterDemo(page);
  await expect(page.getByRole("link", { name: "Library", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Extensions", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".yomi-sidebar");
    return {
      sidebarWidth: sidebar?.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(layout.sidebarWidth).toBe(232);
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.bodyBackground).toBe("rgb(9, 10, 12)");
});

test("history and settings remain usable through real navigation", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.locator("article.yomi-history-row").first()).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await expect(page.getByText("Advanced Settings", { exact: true })).toBeVisible();
});
