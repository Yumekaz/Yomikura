import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { checkoutRoot } from "./releases.mjs";

const build = JSON.parse(await readFile(path.join(checkoutRoot, ".cache/public-site-current-build.json"), "utf8"));
const require = createRequire(path.join(build.source, "package.json"));
const { chromium, expect } = require("@playwright/test");
const runtimes = JSON.parse(await readFile(new URL("./server-runtimes.json", import.meta.url), "utf8"));
for (const runtime of runtimes) await verifyRuntime(runtime);

async function verifyRuntime({ version, sha256 }) {
const cache = process.env.SUWAYOMI_CACHE || path.join(checkoutRoot, ".cache/site-server-deps"); await mkdir(cache, { recursive: true });
assert.match(version, /^\d+\.\d+\.\d+$/); assert.match(sha256, /^[a-f0-9]{64}$/);
const jarName = `Suwayomi-Server-v${version}.jar`, expected = sha256;
const jar = path.join(cache, jarName);
async function digest(file) { const hash = createHash("sha256"); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest("hex"); }
if (!await stat(jar).catch(() => null) || await digest(jar) !== expected) {
  if (await stat(jar).catch(() => null)) await rename(jar, jar + `.unverified-${Date.now()}`);
  const part = jar + `.part-${Date.now()}`;
  const response = await fetch(`https://github.com/Suwayomi/Suwayomi-Server/releases/download/v${version}/${jarName}`, { signal: AbortSignal.timeout(180000) });
  assert.ok(response.ok && response.body, `Pinned server download returned HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
  assert.equal(await digest(part), expected, "Pinned server SHA-256 differs; failed bytes are retained");
  await rename(part, jar);
}
const parent = path.join(checkoutRoot, ".cache/web-guide-live"); await mkdir(parent, { recursive: true });
const root = await mkdtemp(path.join(parent, `library-${version}-`));
await cp(build.webRoot, path.join(root, "webUI"), { recursive: true });
const chapter = path.join(root, "local/Web Guide Story/Chapter 1"); await mkdir(chapter, { recursive: true });
await cp(path.join(build.source, "public/demo/moonlit-courier-page.webp"), path.join(chapter, "001.webp"));
await cp(path.join(build.source, "public/demo/paper-garden-page.webp"), path.join(chapter, "002.webp"));
await cp(path.join(build.source, "public/demo/moonlit-courier.webp"), path.join(root, "local/Web Guide Story/cover.webp"));
const log = createWriteStream(path.join(root, "server.log"));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
const origin = "http://127.0.0.1:4599";
const child = spawn(java, ["-Xmx512m", "-XX:ActiveProcessorCount=2", `-Dsuwayomi.tachidesk.config.server.rootDir=${root}`, "-Dsuwayomi.tachidesk.config.server.port=4599", "-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1", "-Dsuwayomi.tachidesk.config.server.webUIFlavor=CUSTOM", "-Dsuwayomi.tachidesk.config.server.webUIEnabled=true", "-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false", "-Dsuwayomi.tachidesk.config.server.kcefEnabled=false", "-jar", jar], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
let exited = false, spawnError, browser, page;
const exit = new Promise((resolve) => child.once("exit", () => { exited = true; resolve(); }));
child.once("error", (error) => { spawnError = error; });
try {
  const deadline = Date.now() + 180000;
  while (true) {
    if (spawnError) throw spawnError;
    assert.equal(exited, false, "Pinned test server exited; inspect retained server.log");
    const response = await fetch(origin + "/api/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ aboutServer { version } }" }), signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (response?.ok && (await response.json()).data?.aboutServer?.version) break;
    assert.ok(Date.now() < deadline, "Pinned CUSTOM WebUI server did not become ready"); await delay(500);
  }
  const html = await fetch(origin + "/"); assert.equal(html.status, 200); assert.match(await html.text(), /<title>Yomikura<\/title>/);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 980 }, reducedMotion: "reduce" });
  await page.goto(origin + "/setup");
  await expect(page.getByRole("heading", { name: "Your browser. Your reading room.", exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Your Suwayomi address", { exact: true }).fill(origin);
  await page.getByRole("button", { name: "Connect my library", exact: true }).click();
  await expect(page.getByText("Your library is connected. Next, choose your sources below.", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Add books", exact: true }).click();
  await page.getByRole("link", { name: "Browse Local source", exact: true }).click();
  await page.getByRole("link", { name: "Web Guide Story", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Web Guide Story", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to Library", exact: true }).click();
  await page.getByRole("button", { name: "Save to library", exact: true }).click();
  await expect(page.getByRole("button", { name: "In Library", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Resume", exact: true }).first().click();
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 1", exact: true })).toHaveCSS("opacity", "1", { timeout: 30000 });
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toHaveCSS("opacity", "1");
  await expect(page.getByText("2 of 2 pages", { exact: true })).toBeVisible();
  await expect.poll(async () => { const response = await fetch(origin + "/api/v1/manga/1/chapters"); return (await response.json())[0]?.lastPageRead; }).toBe(1);
  await page.reload();
  await expect(page.getByText("2 of 2 pages", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[id^="reader-page-"]').getByRole("img", { name: "Page 2", exact: true })).toHaveCSS("opacity", "1");
  await page.goto(origin + "/library"); await page.reload();
  await expect(page.getByRole("link", { name: "Web Guide Story", exact: true }).first()).toBeVisible({ timeout: 30000 });
  await writeFile(path.join(root, "result.json"), JSON.stringify({ runtime: `Suwayomi v${version} / Java 21`, customWebUI: "PASS: unpacked ordinary web build served at root", guideConnectionForm: "PASS", sourceDiscovery: "PASS: built-in Local, original-art pages only", categoryAwareLibraryAdd: "PASS", reading: "PASS: decoded two pages", progress: "PASS: server lastPageRead=1 and reader restore at page2", normalDeepLinkRefresh: "PASS: /setup, /reader/1 and /library", boundaries: ["isolated empty backend", "no user library modified", "third-party extensions and interactive OS bundle launcher not exercised"] }, null, 2));
  console.log(`Verified the downloadable web build on real pinned Suwayomi v${version} CUSTOM WebUI: guide connect, Local discovery, library add, decoded pages, progress and deep-link refresh.`);
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(root, "failed-page.jpg"), fullPage: true, type: "jpeg", quality: 85 }).catch(() => {}); await writeFile(path.join(root, "failed-dom.txt"), await page.locator("body").innerText().catch(() => "Unavailable")); }
  await writeFile(path.join(root, "failure.txt"), String(error)); throw error;
} finally {
  await browser?.close();
  if (!exited) { child.kill("SIGTERM"); await Promise.race([exit, delay(15000)]); }
  if (!exited) { child.kill("SIGKILL"); await exit; }
  log.end();
}
}
