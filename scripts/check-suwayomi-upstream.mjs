import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const pinned = source.match(/SUWAYOMI_JAR_NAME: &str = "Suwayomi-Server-v([\d.]+)\.jar"/)?.[1];
if (!pinned) throw new Error("Could not read the pinned Suwayomi version from src-tauri/src/lib.rs");

const headers = { accept: "application/vnd.github+json", "user-agent": "Yomikura-upstream-watch" };
async function latestRelease(repository) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${repository}`);
  return (await response.json()).tag_name.replace(/^v/, "");
}

const [stable, preview] = await Promise.all([
  latestRelease("Suwayomi/Suwayomi-Server"),
  latestRelease("Suwayomi/Suwayomi-Server-preview"),
]);
const numbers = (value) => value.split(".").map(Number);
const compare = (left, right) => {
  const a = numbers(left);
  const b = numbers(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0) ? 1 : -1;
  }
  return 0;
};

const report = [
  "# Suwayomi upstream compatibility watch",
  "",
  `- Yomikura pinned runtime: v${pinned}`,
  `- Latest stable: v${stable}`,
  `- Latest preview: v${preview}`,
  `- Stable status: ${compare(pinned, stable) >= 0 ? "current or newer" : "review required"}`,
  `- Preview drift: ${compare(pinned, preview) >= 0 ? "none" : "new preview available for compatibility review"}`,
  "",
  "A newer preview is informational. It must not replace the pinned runtime until backup restore, database migration, extension install/update, downloads, reader, and installer smoke tests pass.",
].join("\n");

await writeFile(new URL("../suwayomi-upstream-report.md", import.meta.url), `${report}\n`);
console.log(report);
if (compare(pinned, stable) < 0) process.exitCode = 1;
