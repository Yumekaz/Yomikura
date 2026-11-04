import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, normalizeRelease, validateAsset, releaseHtml } from "./releases.mjs";

const tag = "v1.0.25-beta.5";
const asset = (name) => ({ name, size: 1234, digest: "sha256:" + "a".repeat(64), browser_download_url: `https://github.com/Yumekaz/Yomikura/releases/download/${tag}/${name}` });
test("the public current version advances by version rather than release creation time", () => {
  assert.ok(compareVersions("v1.0.25-beta.5", "v1.0.24") > 0);
  assert.ok(compareVersions("v1.0.25", "v1.0.25-beta.5") > 0);
  assert.ok(compareVersions("v1.0.25-beta.10", "v1.0.25-beta.5") > 0);
  assert.equal(compareVersions(tag, tag), 0);
});
test("installer links stay bound to the original repository, tag and flat filename", () => {
  const good = asset("Yomikura_1.0.25-beta.5_x64-setup.exe");
  assert.equal(validateAsset(good, tag).url, good.browser_download_url);
  for (const value of [
    { ...good, browser_download_url: good.browser_download_url.replace("Yumekaz/Yomikura", "other/reader") },
    { ...good, browser_download_url: good.browser_download_url.replace(tag, "v9.9.9") },
    { ...good, browser_download_url: good.browser_download_url.replace("https:", "http:") },
    { ...good, browser_download_url: good.browser_download_url + "?token=secret" },
    { ...good, name: "../outside.exe" }, { ...good, size: -1 }, { ...good, digest: "sha256:changed" },
  ]) assert.throws(() => validateAsset(value, tag));
});
test("public release metadata retains architectures and optional original checksums", () => {
  const metadata = normalizeRelease({ tag_name: tag, draft: false, prerelease: true, published_at: "2026-11-04T09:50:54Z", html_url: `https://github.com/Yumekaz/Yomikura/releases/tag/${tag}`, assets: [
    asset("Yomikura_1.0.25-beta.5_x64-setup.exe"), asset("Yomikura_1.0.25-beta.5_aarch64.dmg"), asset("Yomikura_1.0.25-beta.5_amd64.AppImage"), asset("SHA256SUMS-windows-latest.txt"),
  ] });
  assert.equal(metadata.assets.macos.architecture, "Apple silicon");
  assert.equal(metadata.assets.windows.sha256, "a".repeat(64));
  assert.equal(metadata.assets.checksums.linux, null);
  assert.equal(metadata.assets.checksums.windows.name, "SHA256SUMS-windows-latest.txt");
});
test("drafts and incomplete platform packages cannot become public download metadata", () => {
  const release = { tag_name: tag, draft: true, html_url: `https://github.com/Yumekaz/Yomikura/releases/tag/${tag}`, assets: [] };
  assert.throws(() => normalizeRelease(release));
  assert.throws(() => normalizeRelease({ ...release, draft: false }));
});
test("the assembled no-JavaScript download paths follow the selected release", () => {
  const html = '<a href="old" data-download-primary>Download</a><a data-platform="windows" href="old">Windows</a><a href="old" data-web-download>Web</a><a data-stable-link href="old">Stable</a><span data-release-version>old</span><span data-release-kind>old</span><span data-web-version>old</span>';
  const metadata = { primary: { tag: "v2.0.0", prerelease: false, url: "https://github.com/Yumekaz/Yomikura/releases/tag/v2.0.0", assets: { windows: { url: "https://github.com/Yumekaz/Yomikura/releases/download/v2.0.0/setup.exe" } } }, stable: { url: "https://github.com/Yumekaz/Yomikura/releases/tag/v2.0.0" }, web: { url: "/Yomikura/downloads/Yomikura-web-2.0.0.zip", version: "2.0.0" } };
  const updated = releaseHtml(html, metadata);
  assert.ok(!updated.includes('href="old"'));
  assert.match(updated, /data-release-version>v2\.0\.0<\/span>/);
  assert.match(updated, /data-release-kind>Stable release<\/span>/);
  assert.ok(updated.includes('href="/Yomikura/downloads/Yomikura-web-2.0.0.zip"'));
});
