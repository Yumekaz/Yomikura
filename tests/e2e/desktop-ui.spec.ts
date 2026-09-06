import { expect, test } from "@playwright/test";

async function enterDemo(page: import("@playwright/test").Page) {
  await page.goto("/library");
  const demoButton = page.getByRole("button", { name: "Explore Demo Library" });
  await expect(demoButton).toBeVisible({ timeout: 15_000 });
  await demoButton.click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
}

test("desktop shell keeps one clear navigation hierarchy", async ({ page }) => {
  await enterDemo(page);
  await expect(page.getByRole("link", { name: "Library", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Continue", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Browse", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Extensions", exact: true })).toHaveCount(0);
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
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.locator("article.yomi-history-row").first()).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await expect(page.getByText("Advanced Settings", { exact: true })).toBeVisible();
});

test("downloads combines offline files and server activity", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "Downloads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Downloads", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved chapters", exact: true })).toBeVisible();
  await expect(page.getByText(/Downloader is (working|paused)/i)).toBeVisible();
});

test("dangerous settings actions use an accessible, cancellable dialog", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await page.getByRole("button", { name: "Reset All Settings", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset all settings?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
