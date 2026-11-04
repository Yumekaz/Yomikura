import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkoutRoot, websiteRoot, PAGES_BASE, readReleases, releaseHtml } from "./releases.mjs";
import readerConfig from "../vite.reader.config.ts";
import { generateLicenseNotices } from "../../scripts/generate-license-notices.mjs";

const run = promisify(execFile);
const source = path.resolve(process.env.READER_SOURCE || path.join(checkoutRoot, ".reader-source"));
const output = path.resolve(process.env.SITE_OUTPUT || path.join(checkoutRoot, "site-dist"));
const metadata = await readReleases();
assert.equal((await run("git", ["rev-parse", "HEAD"], { cwd: source })).stdout.trim(), metadata.reader.commit, "Reader checkout differs from the reviewed public release");
assert.equal(JSON.parse(await readFile(path.join(source, "package.json"), "utf8")).version, metadata.primary.version);
assert.ok(!await stat(output).catch(() => null), "Site output already exists; select a new SITE_OUTPUT rather than overwriting retained work");
await mkdir(output, { recursive: true });
const cache = path.join(checkoutRoot, ".cache"); await mkdir(cache, { recursive: true });
const working = await mkdtemp(path.join(cache, "public-site-build-"));
const require = createRequire(path.join(source, "package.json"));
const { build } = await import(pathToFileURL(path.join(path.dirname(require.resolve("vite/package.json")), "dist/node/index.js")).href);
const originalCwd = process.cwd();

// The root-hosted browser files are the ordinary released app, unchanged.
const webRoot = path.join(working, "web");
process.chdir(source);
try { await build({ configFile: path.join(source, "vite.config.ts"), configLoader: "native", build: { outDir: webRoot, emptyOutDir: false } }); }
finally { process.chdir(originalCwd); }
for (const filename of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await cp(path.join(source, filename), path.join(webRoot, filename));
await generateLicenseNotices(source, path.join(webRoot, "licenses/THIRD_PARTY_NPM.txt"));
await writeFile(path.join(webRoot, "source.json"), JSON.stringify({ repository: "https://github.com/Yumekaz/Yomikura", ...metadata.reader }, null, 2) + "\n");
await writeFile(path.join(webRoot, "README-Yomikura.txt"), `Yomikura web ${metadata.primary.version}\n\nThis is the built browser interface; no Git clone or frontend compilation is required.\n\nFollow the illustrated guide: https://yumekaz.github.io/Yomikura/setup/\n\nSuwayomi CUSTOM WebUI: stop your server, preserve any existing custom WebUI, and extract this archive's CONTENTS directly into the webUI folder inside Suwayomi's data directory. index.html and assets must sit directly in that folder, not in another nested folder. Choose CUSTOM as the WebUI flavor and restart Suwayomi. Your usual local Suwayomi address now opens Yomikura. Keep the server running while reading. Do not move or delete your database, downloads or other library data.\n\nFor another static HTTP server, enable index.html fallback for application routes. Opening index.html directly as a file is not supported.\n\nYour books and sources are managed by Suwayomi. No third-party sources or comic content are included.\n`);
const downloads = path.join(output, "downloads"); await mkdir(downloads);
const zipName = path.basename(metadata.web.url);
await run(process.platform === "win32" ? "python" : "python3", ["-m", "zipfile", "-c", path.join(downloads, zipName), ...await readdir(webRoot)], { cwd: webRoot, maxBuffer: 1024 * 1024 });
const zip = await readFile(path.join(downloads, zipName));
metadata.web.sha256 = createHash("sha256").update(zip).digest("hex"); metadata.web.bytes = zip.length;
await writeFile(path.join(downloads, zipName + ".sha256"), `${metadata.web.sha256}  ${zipName}\n`);

// Only the public hosted demo gets a hash router and base-aware public assets.
const demoEntry = path.join(source, ".website-demo-entry");
assert.ok(!await stat(demoEntry).catch(() => null), "Demo entry staging directory unexpectedly exists");
await mkdir(demoEntry);
await cp(path.join(websiteRoot, "reader-entry.tsx"), path.join(demoEntry, "main.tsx"));
await writeFile(path.join(demoEntry, "index.html"), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Explore Yomikura with two original illustrated demo stories. No server or account needed."><link rel="icon" href="${PAGES_BASE}app/yomikura-logo.png"><title>Yomikura · Interactive demo</title></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>`);
process.chdir(source);
try { await build(await readerConfig({ source, entry: demoEntry, outDir: path.join(output, "app"), base: PAGES_BASE + "app/" })); }
finally { process.chdir(originalCwd); }
await cp(path.join(webRoot, "licenses/THIRD_PARTY_NPM.txt"), path.join(output, "app/licenses/THIRD_PARTY_NPM.txt"));

const assets = path.join(output, "assets"); await mkdir(assets, { recursive: true });
for (const [from, to] of [["index.html", "index.html"], ["setup/index.html", "setup/index.html"], ["site.css", "assets/site.css"], ["site.js", "assets/site.js"]]) {
  await mkdir(path.dirname(path.join(output, to)), { recursive: true });
  if (from.endsWith(".html")) await writeFile(path.join(output, to), releaseHtml(await readFile(path.join(websiteRoot, from), "utf8"), metadata));
  else await cp(path.join(websiteRoot, from), path.join(output, to));
}
await cp(path.join(websiteRoot, "assets"), assets, { recursive: true, filter: (file) => !file.endsWith(".md") });
for (const folder of ["identity", "demo"]) await cp(path.join(source, "public", folder), path.join(assets, folder), { recursive: true, filter: (file) => !file.endsWith(".md") });
const fonts = path.join(assets, "fonts"); await mkdir(fonts, { recursive: true });
await cp(path.join(source, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), path.join(fonts, "inter.woff2"));
await cp(path.join(source, "node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2"), path.join(fonts, "playfair.woff2"));
await cp(path.join(source, "node_modules/@fontsource-variable/playfair-display/files/playfair-display-latin-wght-italic.woff2"), path.join(fonts, "playfair-italic.woff2"));
await cp(path.join(source, "public/licenses"), path.join(assets, "licenses"), { recursive: true });
await cp(path.join(source, "LICENSE"), path.join(assets, "licenses/yomikura-MIT.txt"));
await cp(path.join(source, "THIRD_PARTY_NOTICES.md"), path.join(assets, "licenses/THIRD_PARTY_NOTICES.md"));
await cp(path.join(webRoot, "licenses/THIRD_PARTY_NPM.txt"), path.join(assets, "licenses/THIRD_PARTY_NPM.txt"));
await writeFile(path.join(output, "releases.json"), JSON.stringify(metadata, null, 2) + "\n");
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(working, "build.json"), JSON.stringify({ source, webRoot, output, reader: metadata.reader }, null, 2));
await writeFile(path.join(checkoutRoot, ".cache/public-site-current-build.json"), JSON.stringify({ source, webRoot, output, working, reader: metadata.reader }, null, 2));
console.log(`Built public homepage, scoped interactive demo and ${zipName} (${zip.length} bytes).`);
