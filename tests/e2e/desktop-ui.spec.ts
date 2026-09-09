import { expect, test } from "@playwright/test";

const tinyImage = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#242831"/><path d="M70 100h180v280H70z" fill="#e9e3da"/><path d="M100 145h120v18H100zm0 46h120v18H100zm0 46h120v18H100z" fill="#e5483f"/></svg>'
);

async function enterDemo(page: import("@playwright/test").Page) {
  // Keep UI journeys deterministic when a developer has a local Suwayomi
  // engine running. These tests exercise the sandbox, not a personal library.
  await page.route("**/api/graphql", (route) => route.abort());
  await page.route("https://images.unsplash.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: tinyImage })
  );
  await page.goto("/library");
  const demoButton = page.getByRole("button", { name: "Explore Demo Library" });
  await expect(demoButton).toBeVisible({ timeout: 15_000 });
  await demoButton.click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByText("[Demo] Pepper & Carrot", { exact: true })).toBeVisible();
}

test("default onboarding keeps the ivory and bookmark-red brand palette", async ({ page }) => {
  await page.goto("/library");
  const demoButton = page.getByRole("button", { name: "Explore Demo Library" });
  await expect(demoButton).toBeVisible({ timeout: 15_000 });
  await expect(demoButton).toHaveCSS("background-color", "rgb(239, 234, 226)");
  const brandAccent = await page.locator(".text-\\[rgb\\(var\\(--yomi-signature\\)\\)\\]").first().evaluate((element) => getComputedStyle(element).color);
  expect(brandAccent).toBe("rgb(229, 72, 63)");
});

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

test("keyboard users can skip directly to the main content", async ({ page }) => {
  await enterDemo(page);
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("history and settings remain usable through real navigation", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.locator("article.yomi-history-row").first()).toBeVisible();

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Developer and recovery tools", exact: true })).toBeVisible();
});

test("downloads combines offline files and server activity", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "Downloads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Downloads", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved chapters", exact: true })).toBeVisible();
  await expect(page.getByText(/Server queue is clear|Downloader is (working|paused)/i)).toBeVisible();
});

test("dangerous settings actions use an accessible, cancellable dialog", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "advanced", exact: true }).click();
  await page.getByRole("button", { name: "Reset settings", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset all settings?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("extension setup explains the first source step", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/extensions/repos");
  await expect(page.getByRole("heading", { name: "Stores", exact: true })).toBeVisible();
  await expect(page.getByText("Choose who distributes your sources", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this store", exact: true })).toBeVisible();
  await expect(page.getByLabel("Extension Store descriptor URL")).toBeVisible();
});

test("reader opens a demo chapter and exposes a usable page", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/reader/20002");
  await expect(page.getByText("Chapter 1: The Journey Begins", { exact: true })).toBeVisible({ timeout: 15_000 });
  const firstPage = page.locator("#reader-page-0 img");
  await expect(firstPage).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => firstPage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("manga details renders valid dates without horizontal overflow", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/manga/10002");
  await expect(page.getByRole("heading", { name: "[Demo] Pepper & Carrot", exact: true })).toBeVisible();
  await expect(page.getByText("1/1/1970", { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("updates accepts ISO chapter dates without showing 1970", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/updates");
  await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
  await expect(page.getByText("1/1/1970")).toHaveCount(0);
  await expect(page.getByText("Chapter 1: The Journey Begins")).toBeVisible();
});

test("settings search opens an addressable section", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/settings");
  await page.getByLabel("Search settings").fill("backup");
  await page.getByRole("option", { name: /Backup and restore/ }).click();
  await expect(page).toHaveURL(/\/settings\/backup$/);
  await expect(page.getByRole("heading", { name: "Backup & Restore" })).toBeVisible();
});

test("history search and removal persist without resetting progress", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/reader/20002");
  const firstPage = page.locator("#reader-page-0 img");
  await expect.poll(() => firstPage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.goto("/history");
  await page.getByPlaceholder("Search history…").fill("Pepper");
  const historyTitle = page.getByText("[Demo] Pepper & Carrot", { exact: true }).first();
  await expect(historyTitle).toBeVisible();
  await page.getByRole("button", { name: /Remove .* from history/ }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(historyTitle).toBeHidden();
});

test("an interrupted local download resumes after reload", async ({ page }) => {
  await enterDemo(page);
  await page.unroute("https://images.unsplash.com/**");
  await page.route("https://images.unsplash.com/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: tinyImage });
  });
  await page.goto("/manga/10002");
  await page.getByRole("button", { name: "Save Chapter 1: The Journey Begins for offline reading" }).click();
  await expect(page.getByRole("button", { name: "Cancel download of Chapter 1: The Journey Begins" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove offline download of Chapter 1: The Journey Begins" })).toBeVisible({ timeout: 15_000 });
});

test("library view and sort preferences survive reload", async ({ page }) => {
  await enterDemo(page);
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByLabel("Sort library").selectOption("unread");
  await page.reload();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Sort library")).toHaveValue("unread");
  await expect(page.getByText("[Demo] Pepper & Carrot", { exact: true })).toBeVisible();
});

test("automatic backup and update schedules persist", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/settings/backup");
  await page.getByLabel("Automatic backup schedule").selectOption("24");
  await page.getByLabel("Automatic library updates").selectOption("12");
  await page.reload();
  await expect(page.getByLabel("Automatic backup schedule")).toHaveValue("24");
  await expect(page.getByLabel("Automatic library updates")).toHaveValue("12");
});

test("chapter filtering and bulk actions are discoverable", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/manga/10002");
  await expect(page.getByLabel("Filter chapter status")).toBeVisible();
  await expect(page.getByLabel("Filter scanlator")).toBeVisible();
  await page.getByRole("button", { name: "Select visible" }).click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark read" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bookmark" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
});

test("extension repositories require a safe URL and explicit trust", async ({ page }) => {
  await enterDemo(page);
  await page.goto("/extensions/repos");
  const input = page.getByLabel("Extension Store descriptor URL");
  await input.fill("http://example.com/index.json");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("must use HTTPS");
  await input.fill("https://example.com/index.json");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Trust example.com?" })).toBeVisible();
});
