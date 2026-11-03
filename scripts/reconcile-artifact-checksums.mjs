import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function reconcileChecksums(text, assets) {
  const lines = text.trim().split(/\r?\n/);
  assert.ok(text.trim(), "An empty build manifest cannot verify a release");
  const used = new Set();
  return lines.map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert.ok(match, "Invalid build checksum entry");
    const [, digest, original] = match;
    assert.ok(original === path.posix.basename(original) && original === path.win32.basename(original), "Build checksum names must be flat");
    const named = assets.find((asset) => asset.name === original);
    if (named) assert.equal(named.digest, digest, `Uploaded bytes differ from the build: ${original}`);
    // Tauri's release action can add architecture suffixes to macOS updater archives.
    // Resolve that rename only through the original build digest, never a guessed name.
    const matches = named ? [named] : assets.filter((asset) => asset.digest === digest);
    assert.equal(matches.length, 1, `Missing or ambiguous uploaded build asset: ${original}`);
    const asset = matches[0];
    assert.ok(!used.has(asset.name), `Duplicate uploaded build asset: ${asset.name}`);
    used.add(asset.name);
    return `${digest}  ${asset.name}`;
  }).join("\n") + "\n";
}

async function reconcile(directory, manifests) {
  const assets = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(appimage|deb|dmg|exe|msi|rpm|tar\.gz|zip|sig)$/i.test(entry.name)) continue;
    const digest = createHash("sha256").update(await readFile(path.join(directory, entry.name))).digest("hex");
    assets.push({ name: entry.name, digest });
  }
  for (const entry of await readdir(manifests)) {
    if (!/^SHA256SUMS-.+\.txt$/.test(entry)) continue;
    const manifest = path.join(manifests, entry);
    await writeFile(manifest, reconcileChecksums(await readFile(manifest, "utf8"), assets));
    console.log(`Verified original build bytes and published filenames: ${entry}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, manifests] = process.argv.slice(2);
  assert.ok(directory && manifests, "Provide the downloaded release and build manifests");
  await reconcile(directory, manifests);
}
