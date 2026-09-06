import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const tinyImage = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48"><rect width="32" height="48" fill="#202329"/></svg>'
);

async function enterDemo(page: Page) {
  await page.route("**/api/graphql", (route) => route.abort());
  await page.route("https://images.unsplash.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: tinyImage })
  );
  await page.goto("/library");
  const demoButton = page.getByRole("button", { name: "Explore Demo Library" });
  await expect(demoButton).toBeVisible({ timeout: 15_000 });
  await demoButton.click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const persisted = localStorage.getItem("yomikura-settings");
    return persisted ? JSON.parse(persisted).state?.mockMode : false;
  })).toBe(true);
}

async function expectNoSeriousAccessibilityViolations(page: Page, routeName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(blocking, `${routeName} has serious WCAG violations`).toEqual([]);
}

test("core desktop routes have no serious automated WCAG violations", async ({ page }) => {
  await enterDemo(page);

  const routes = [
    { path: "/library", heading: "Library" },
    { path: "/history", heading: "History" },
    { path: "/downloads", heading: "Downloads" },
    { path: "/settings", heading: "Settings" },
    { path: "/extensions", heading: "Extensions" },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page, route.path);
  }
});

test("reader journey survives search, offline save, history, and reload", async ({ page }) => {
  await enterDemo(page);

  await page.goto("/browse/search");
  const search = page.getByPlaceholder("Search manga title globally...");
  await search.fill("Pepper");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("[Demo] Pepper & Carrot", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: /\[Demo\] Pepper & Carrot/ }).first().click();

  await expect(page.getByRole("heading", { name: "[Demo] Pepper & Carrot", exact: true })).toBeVisible({ timeout: 15_000 });
  const saveButton = page.getByRole("button", { name: "Save Chapter 1: The Journey Begins for offline reading" });
  await saveButton.click();
  await expect(page.getByRole("button", { name: "Remove offline download of Chapter 1: The Journey Begins" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: /Chapter 1: The Journey Begins/ }).click();
  await expect(page.getByText("Chapter 1: The Journey Begins", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");

  await page.goto("/history");
  await expect(page.getByText("[Demo] Pepper & Carrot", { exact: true }).first()).toBeVisible();

  await page.goto("/downloads");
  await expect(page.getByText("[Demo] Pepper & Carrot", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Read", exact: true }).click();
  await expect(page.getByText("Chapter 1: The Journey Begins", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Chapter 1: The Journey Begins", { exact: true })).toBeVisible();
});

test("desktop shell and long-reader interaction stay within regression baselines", async ({ page }) => {
  await enterDemo(page);
  const navigationMs = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.domContentLoadedEventEnd ?? 0;
  });
  expect(navigationMs).toBeLessThan(5_000);

  await page.goto("/reader/20002");
  await expect(page.locator("img").first()).toBeVisible({ timeout: 15_000 });
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, 900);
  }

  const baseline = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return {
      domNodes: document.querySelectorAll("*").length,
      renderedImages: document.images.length,
      heapBytes: memory.memory?.usedJSHeapSize ?? 0,
    };
  });
  expect(baseline.domNodes).toBeLessThan(2_000);
  expect(baseline.renderedImages).toBeLessThan(40);
  if (baseline.heapBytes > 0) {
    expect(baseline.heapBytes).toBeLessThan(256 * 1024 * 1024);
  }
});
