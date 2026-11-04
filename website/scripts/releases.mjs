import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "Yumekaz/Yomikura";
export const PAGES_BASE = "/Yomikura/";
export const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const checkoutRoot = path.resolve(websiteRoot, "..");
export const metadataFile = path.join(checkoutRoot, ".cache/public-site-releases.json");

export function versionParts(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/.exec(tag);
  assert.ok(match, `Unsupported public release version: ${tag}`);
  return { numbers: match.slice(1, 4).map(Number), suffix: match[4] || "" };
}
export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let index = 0; index < 3; index++) if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
  if (a.suffix === b.suffix) return 0;
  if (!a.suffix) return 1;
  if (!b.suffix) return -1;
  return a.suffix.localeCompare(b.suffix, "en", { numeric: true });
}
export function validateAsset(asset, tag) {
  const name = asset.name;
  assert.ok(typeof name === "string" && name && !/[\\/\u0000-\u001f]/.test(name), "Release asset must have a flat filename");
  const url = new URL(asset.browser_download_url);
  assert.equal(url.protocol, "https:"); assert.equal(url.hostname, "github.com");
  assert.ok(!url.port && !url.username && !url.password && !url.search && !url.hash);
  assert.equal(url.pathname, `/${REPOSITORY}/releases/download/${tag}/${encodeURIComponent(name)}`);
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0);
  if (asset.digest) assert.match(asset.digest, /^sha256:[a-f0-9]{64}$/);
  return { name, url: url.href, bytes: asset.size, sha256: asset.digest?.slice(7) || null };
}
export function normalizeRelease(release) {
  assert.equal(release.draft, false); versionParts(release.tag_name);
  assert.equal(release.html_url, `https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`);
  const assets = release.assets.map((asset) => validateAsset(asset, release.tag_name));
  const select = (pattern) => assets.find((asset) => pattern.test(asset.name)) || null;
  const windows = select(/_x64-setup\.exe$/i), macos = select(/_aarch64\.dmg$/i), linux = select(/_amd64\.AppImage$/);
  assert.ok(windows && macos && linux, `Public release ${release.tag_name} is missing a supported platform package`);
  return {
    tag: release.tag_name, version: release.tag_name.slice(1), url: release.html_url,
    publishedAt: release.published_at, prerelease: release.prerelease,
    assets: {
      windows: { ...windows, architecture: "x64" }, macos: { ...macos, architecture: "Apple silicon" }, linux: { ...linux, architecture: "x86_64" },
      checksums: { windows: select(/^SHA256SUMS-windows-latest\.txt$/), macos: select(/^SHA256SUMS-macos-latest\.txt$/), linux: select(/^SHA256SUMS-ubuntu-22\.04\.txt$/) },
    },
  };
}
export function releaseHtml(html, metadata) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  let updated = html.replace(/<a\b[^>]*>/g, (anchor) => {
    const platform = /\bdata-platform="(windows|macos|linux)"/.exec(anchor)?.[1];
    const destination = platform ? metadata.primary.assets[platform].url
      : /\bdata-web-download\b/.test(anchor) ? metadata.web.url
      : /\bdata-web-checksum\b/.test(anchor) ? metadata.web.checksumUrl
      : /\bdata-stable-link\b/.test(anchor) ? metadata.stable.url
      : /\bdata-(?:download-primary|release-link)\b/.test(anchor) ? metadata.primary.url : null;
    return destination ? anchor.replace(/\bhref="[^"]*"/, `href="${escape(destination)}"`) : anchor;
  });
  for (const [attribute, value] of [["release-version", metadata.primary.tag], ["release-kind", metadata.primary.prerelease ? "Public beta" : "Stable release"], ["web-version", `v${metadata.web.version}`]]) {
    updated = updated.replace(new RegExp(`(<[^>]+\\bdata-${attribute}\\b[^>]*>)[^<]*(</[^>]+>)`, "g"), (_match, start, end) => start + escape(value) + end);
  }
  updated = updated.replace(/(<a\b[^>]*\bdata-stable-link\b[^>]*>)[\s\S]*?(<\/a>)/g, (_match, start, end) => start + escape(`${metadata.primary.prerelease ? "Previous stable release" : "Current stable release"} · ${metadata.stable.tag || metadata.primary.tag}`) + end);
  return updated;
}
async function github(route) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Yomikura-public-site" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${route}`, { headers });
  assert.ok(response.ok, `Release metadata request returned HTTP ${response.status}`);
  return response.json();
}
export async function resolveReleases() {
  const [releases, latest] = await Promise.all([github("releases?per_page=100"), github("releases/latest")]);
  const published = releases.filter((release) => !release.draft && release.published_at && /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(release.tag_name));
  const betaRecord = published.filter((release) => release.prerelease).sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
  assert.ok(betaRecord, "No public beta is available for the product preview");
  const beta = normalizeRelease(betaRecord), stable = normalizeRelease(latest);
  const primary = compareVersions(beta.tag, stable.tag) > 0 ? beta : stable;
  const primaryRecord = primary === beta ? betaRecord : latest;
  assert.match(primaryRecord.target_commitish, /^[a-f0-9]{40}$/, "The preview source must be pinned to an exact released commit");
  const result = {
    schema: 1, generatedAt: new Date().toISOString(), primary, beta, stable,
    reader: { tag: primary.tag, commit: primaryRecord.target_commitish, sourceUrl: `https://github.com/${REPOSITORY}/tree/${primary.tag}` },
    web: { url: `${PAGES_BASE}downloads/Yomikura-web-${primary.version}.zip`, checksumUrl: `${PAGES_BASE}downloads/Yomikura-web-${primary.version}.zip.sha256`, version: primary.version, sha256: null, bytes: null },
    links: { repo: `https://github.com/${REPOSITORY}`, issues: `https://github.com/${REPOSITORY}/issues`, privacy: `https://github.com/${REPOSITORY}/blob/main/PRIVACY.md`, setup: `${PAGES_BASE}setup/`, demo: `${PAGES_BASE}app/#/library` },
  };
  await mkdir(path.dirname(metadataFile), { recursive: true });
  await writeFile(metadataFile, JSON.stringify(result, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `reader_ref=${result.reader.tag}\nreader_commit=${result.reader.commit}\n`);
  console.log(`Resolved public ${primary.tag}; stable ${stable.tag}; pinned reader ${result.reader.commit}.`);
  return result;
}
export async function readReleases() { return JSON.parse(await readFile(metadataFile, "utf8")); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await resolveReleases();
