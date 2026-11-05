import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkoutRoot, PAGES_BASE } from "./releases.mjs";
import { serve } from "./serve.mjs";

const build = JSON.parse(await readFile(path.join(checkoutRoot, ".cache/public-site-current-build.json"), "utf8"));
const require = createRequire(path.join(build.source, "package.json"));
const { chromium, expect } = require("@playwright/test");
const axeModule = require("@axe-core/playwright");
const AxeBuilder = axeModule.default || axeModule.AxeBuilder;
let hosted = await serve(build.output);
const browser = await chromium.launch();
const review = path.join(checkoutRoot, ".cache/homepage-review"); await mkdir(review, { recursive: true });
const screens = path.join(build.output, "assets/screens"); await mkdir(screens, { recursive: true });
const failures = [], networkFailures = [], demoRequests = [];
const metadata = JSON.parse(await readFile(path.join(build.output, "releases.json"), "utf8"));
const contexts = [];
let currentPage;

function observe(page, demo = false) {
  page.on("response", (response) => { if (response.url().startsWith(hosted.origin) && response.status() >= 400) networkFailures.push(`${response.status()} ${response.url()}`); });
  page.on("pageerror", (error) => failures.push(error.message));
  if (demo) page.on("request", (request) => { const url = request.url(); if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(url) && !url.startsWith(hosted.origin)) demoRequests.push(url); });
}
async function context(options = {}) {
  const result = await browser.newContext({ viewport: { width: 1440, height: 980 }, reducedMotion: "reduce", ...options }); contexts.push(result); return result;
}
async function settledImages(page) {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => [...document.images].filter((image) => { const box = image.getBoundingClientRect(); return box.width && box.height && box.bottom > 0 && box.top < innerHeight; }).every((image) => image.complete && image.naturalWidth > 0)), { timeout: 20000 }).toBe(true);
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((image) => image.complete && image.naturalWidth > 0).map((image) => image.decode()));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function revealPage(page) {
  for (const image of await page.locator('img[loading="lazy"]').all()) if (await image.isVisible()) { await image.scrollIntoViewIfNeeded(); await settledImages(page); }
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await settledImages(page);
}
async function audit(page, label) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(result.violations, [], `${label} accessibility violations: ${JSON.stringify(result.violations.map((issue) => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map((node) => node.target) })))}`);
}

try {
  // Capture the actual released application with its original demo stories.
  // These are product screenshots, not invented interfaces or private libraries.
  for (const palette of ["ember", "sakura", "forest", "moonstone"]) for (const appearance of ["dark", "light"]) {
    const appContext = await context();
    await appContext.addInitScript(({ palette, appearance }) => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { mockMode: true, themeMode: appearance, colorPalette: palette } })), { palette, appearance });
    const page = currentPage = await appContext.newPage(); observe(page, true);
    await page.goto(hosted.origin + PAGES_BASE + "app/#/library");
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("link", { name: "[Demo] Moonlit Courier", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "[Demo] The Paper Garden", exact: true })).toBeVisible();
    await settledImages(page);
    await page.screenshot({ path: path.join(screens, `library-${palette}${appearance === "light" ? "-light" : ""}.jpg`), type: "jpeg", quality: 82 });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(page).toHaveURL(/#\/library$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
    if (palette === "ember" && appearance === "dark") {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto(hosted.origin + PAGES_BASE + "app/#/reader/20002");
      await expect(page.getByRole("button", { name: "Go to page 2", exact: true })).toBeVisible({ timeout: 30000 });
      await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
      await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toHaveCSS("opacity", "1");
      await expect(page.getByRole("region", { name: "Reading surface", exact: true })).toHaveAttribute("aria-busy", "false");
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect(page.getByRole("button", { name: "Reset reader zoom", exact: true })).toHaveText("120%");
      await page.getByRole("button", { name: "Reset reader zoom", exact: true }).click();
      await page.screenshot({ path: path.join(screens, "reader.jpg"), type: "jpeg", quality: 82 });
    }
    await appContext.close();
  }
  assert.deepEqual(demoRequests, [], "The public demo must not probe a visitor's local server");

  // Screenshot generation is complete. Serve a fresh immutable snapshot so the
  // homepage can load those images without request-time filesystem access.
  await hosted.close(); hosted = await serve(build.output);

  const desktop = await context(); const page = currentPage = await desktop.newPage(); observe(page);
  await page.goto(hosted.origin + PAGES_BASE);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await settledImages(page);
  await expect(page.locator("[data-download-primary]").first()).toHaveAttribute("href", metadata.primary.assets.linux.url);
  for (const platform of ["windows", "macos", "linux"]) await expect(page.locator(`[data-platform="${platform}"]`).first()).toHaveAttribute("href", metadata.primary.assets[platform].url);
  await expect(page.locator("[data-stable-link]").first()).toHaveAttribute("href", metadata.stable.url);
  await expect(page.getByRole("link", { name: "Follow the browser guide", exact: true })).toHaveAttribute("href", "./setup/");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Desktop homepage overflows horizontally");
  for (const palette of ["sakura", "forest", "moonstone", "ember"]) {
    const tab = page.locator(`[data-palette="${palette}"]`).first(); await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-library-preview]").first()).toHaveAttribute("src", new RegExp(`library-${palette}\\.jpg$`));
  }
  await revealPage(page);
  await page.screenshot({ path: path.join(review, "homepage-dark-desktop.jpg"), fullPage: true, type: "jpeg", quality: 85 });
  await audit(page, "Homepage dark desktop");
  const darkAppearance = await page.evaluate(() => { const style = getComputedStyle(document.body); return JSON.stringify([style.color, style.backgroundColor]); });
  await page.locator("[data-theme-toggle]").click();
  await expect.poll(() => page.evaluate(() => { const style = getComputedStyle(document.body); return JSON.stringify([style.color, style.backgroundColor]); })).not.toBe(darkAppearance);
  await page.reload();
  await expect.poll(() => page.evaluate(() => { const style = getComputedStyle(document.body); return JSON.stringify([style.color, style.backgroundColor]); })).not.toBe(darkAppearance);
  await revealPage(page);
  await page.screenshot({ path: path.join(review, "homepage-light-desktop.jpg"), fullPage: true, type: "jpeg", quality: 85 });
  await audit(page, "Homepage light desktop");
  await page.keyboard.press("Tab");
  assert.ok(await page.evaluate(() => document.activeElement !== document.body), "Keyboard focus must reach homepage controls");
  await page.goto(hosted.origin + PAGES_BASE + "setup/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await settledImages(page);
  await expect(page.locator("[data-web-download]").first()).toHaveAttribute("href", metadata.web.url);
  await expect(page.getByRole("list", { name: "Windows ZIP setup" })).toContainText("windows-x64.zip");
  await expect(page.getByRole("list", { name: "Windows ZIP setup" })).toContainText("Suwayomi Launcher.bat");
  await page.getByText("Already have a Suwayomi library?", { exact: true }).click();
  await expect(page.getByText(/Selecting Downloads itself/)).toBeVisible();
  await page.getByText("Where is Suwayomi’s data folder?", { exact: true }).click();
  await expect(page.getByText(/First check the launcher/)).toBeVisible();
  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Copied", exact: true }).first()).toBeVisible();
  await revealPage(page);
  await page.screenshot({ path: path.join(review, "setup-light-desktop.jpg"), fullPage: true, type: "jpeg", quality: 85 });
  await audit(page, "Public setup guide");
  // The optional address helper must navigate directly, even with the public
  // page's CSP, and must reject credentials before opening another tab.
  await page.getByLabel("Your library address", { exact: true }).fill("https://reader:example-password@library.example/");
  await page.getByRole("button", { name: "Open my library", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("without a username or password");
  await desktop.route("https://library.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Synthetic library</h1>" }));
  await page.getByLabel("Your library address", { exact: true }).fill("https://library.example/");
  const opened = desktop.waitForEvent("page");
  await page.getByRole("button", { name: "Open my library", exact: true }).click();
  const libraryTab = await opened; await expect(libraryTab).toHaveURL("https://library.example/"); await libraryTab.close();
  await page.reload(); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const zip = await fetch(hosted.origin + metadata.web.url); assert.equal(zip.status, 200); assert.equal(Number(zip.headers.get("content-length")), metadata.web.bytes);
  const checksum = await fetch(hosted.origin + metadata.web.checksumUrl); assert.equal(checksum.status, 200); assert.ok((await checksum.text()).startsWith(metadata.web.sha256));

  const mobile = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = currentPage = await mobile.newPage(); observe(phone);
  await phone.goto(hosted.origin + PAGES_BASE); await expect(phone.getByRole("heading", { level: 1 })).toBeVisible();
  await settledImages(phone);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Mobile homepage overflows horizontally");
  await audit(phone, "Mobile homepage");
  await revealPage(phone);
  await phone.screenshot({ path: path.join(review, "homepage-dark-mobile.jpg"), fullPage: true, type: "jpeg", quality: 85 });
  await phone.goto(hosted.origin + PAGES_BASE + "setup/"); await expect(phone.getByRole("heading", { level: 1 })).toBeVisible();
  await phone.locator("[data-theme-toggle]").click();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Mobile guide overflows horizontally");
  await audit(phone, "Mobile light setup guide");
  await revealPage(phone);
  await phone.screenshot({ path: path.join(review, "setup-light-mobile.jpg"), fullPage: true, type: "jpeg", quality: 85 });
  assert.deepEqual(networkFailures, [], "Website or demo assets returned HTTP errors"); assert.deepEqual(failures, [], "Website or demo reported page errors");
  await writeFile(path.join(review, "results.json"), JSON.stringify({ reader: metadata.reader, desktop: "PASS", mobile: "PASS at 390px", appearance: "dark/light", palettePreviews: 8, accessibility: "WCAG 2A/AA + 2.1AA axe checks", demoLocalRequests: 0, siteAssetFailures: networkFailures, pageErrors: failures, webArchiveBytes: metadata.web.bytes }, null, 2));
  console.log("Verified /Yomikura/ paths, homepage/guide controls, desktop/mobile themes, accessibility, four original-art demo palettes in both appearances, real demo reading and the downloadable web archive.");
} catch (error) {
  if (currentPage && !currentPage.isClosed()) { await currentPage.screenshot({ path: path.join(review, "failed-attempt.jpg"), fullPage: true, type: "jpeg", quality: 85 }).catch(() => {}); await writeFile(path.join(review, "failed-dom.txt"), await currentPage.locator("body").innerText().catch(() => "Unavailable")); }
  await writeFile(path.join(review, "failed-check.json"), JSON.stringify({ message: String(error), networkFailures, pageErrors: failures, demoRequests }, null, 2)); throw error;
} finally { await Promise.allSettled(contexts.map((item) => item.close())); await browser.close(); await hosted.close(); }
