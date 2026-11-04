import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function inspectUpdaterManifest(manifest, tag, repository) {
  assert.equal(manifest.version?.replace(/^v/, ""), tag.replace(/^v/, ""), "Updater version must match the release tag");
  assert.ok(manifest.platforms && typeof manifest.platforms === "object" && !Array.isArray(manifest.platforms), "Missing updater platforms");
  assert.ok(manifest.platforms["windows-x86_64"] && manifest.platforms["linux-x86_64"], "Missing Windows or Linux updater target");
  assert.ok(Object.keys(manifest.platforms).some((target) => /^darwin-(aarch64|x86_64)$/.test(target)), "Missing macOS updater target");
  return Object.entries(manifest.platforms).map(([target, entry]) => {
    assert.match(target, /^[a-z0-9_-]+$/, "Invalid updater target");
    const url = new URL(entry.url), prefix = `/${repository}/releases/download/${tag}/`;
    assert.ok(url.protocol === "https:" && url.hostname === "github.com" && !url.port && !url.username && !url.password && !url.search && !url.hash && url.pathname.startsWith(prefix), "Updater URL must belong to this repository and tag");
    const name = decodeURIComponent(url.pathname.slice(prefix.length));
    assert.ok(name && name === path.posix.basename(name) && name === path.win32.basename(name) && name !== "." && name !== "..", "Updater asset must have a flat filename");
    assert.ok(typeof entry.signature === "string" && entry.signature.trim(), "Missing updater signature");
    return { target, name, signature: entry.signature.trim() };
  });
}

async function verify(directory, tag) {
  const repository = process.env.GH_REPO || process.env.GITHUB_REPOSITORY;
  assert.ok(repository, "Provide GH_REPO for the release being verified");
  const config = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const manifest = JSON.parse(await readFile(path.join(directory, "latest.json"), "utf8"));
  const entries = inspectUpdaterManifest(manifest, tag, repository);
  const publicKey = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8").trim().split(/\r?\n/).at(-1);
  assert.ok(publicKey, "Missing configured updater public key");
  const signatures = new Map();
  const temp = await mkdtemp(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "yomikura-signatures-"));
  for (const entry of entries) {
    if (signatures.has(entry.name)) {
      assert.equal(signatures.get(entry.name), entry.signature, "Updater aliases disagree about the signature");
      continue;
    }
    const signature = (await readFile(path.join(directory, `${entry.name}.sig`), "utf8")).trim();
    assert.equal(entry.signature, signature, "Updater metadata differs from the attached signature");
    const signaturePath = path.join(temp, `${entry.target}.minisig`);
    await writeFile(signaturePath, Buffer.from(signature, "base64"));
    // Use the established verifier, including its trusted-comment check.
    await promisify(execFile)("minisign", ["-Vm", path.resolve(directory, entry.name), "-x", signaturePath, "-P", publicKey]);
    signatures.set(entry.name, signature);
  }
  console.log(`Verified ${signatures.size} updater payload signatures against the configured public key; ${entries.length} target mappings match ${tag}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, tag] = process.argv.slice(2);
  assert.ok(directory && tag, "Provide the downloaded release directory and tag");
  await verify(directory, tag);
}
