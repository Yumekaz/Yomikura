import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { inspectUpdaterManifest } from "./verify-updater-manifest.mjs";

const run = promisify(execFile);
const script = path.resolve("scripts/write-artifact-checksums.mjs");
async function fixture() {
  const parent = path.resolve(".cache");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "release-assets-"));
  const bundle = path.join(root, "bundle"), output = path.join(root, "SHA256SUMS.txt");
  await mkdir(bundle);
  return { root, bundle, output };
}
async function asset(bundle, name, bytes = "hello") {
  const file = path.join(bundle, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

test("checksums verify assets downloaded without the build directory structure", async () => {
  const { bundle, output } = await fixture();
  await asset(bundle, "nsis/Yomikura_setup.exe");
  await asset(bundle, "nsis/Yomikura_setup.exe.sig");
  await asset(bundle, "ignored.txt");
  await run(process.execPath, [script, bundle, output]);
  const lines = (await readFile(output, "utf8")).trim().split("\n").sort();
  const hello = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
  assert.deepEqual(lines, [`${hello}  Yomikura_setup.exe`, `${hello}  Yomikura_setup.exe.sig`]);
});

test("duplicate flattened names fail instead of publishing ambiguous checksums", async () => {
  const { bundle, output } = await fixture();
  await asset(bundle, "first/Yomikura.exe");
  await asset(bundle, "second/yomikura.EXE");
  await assert.rejects(run(process.execPath, [script, bundle, output]), /Duplicate release asset name/);
  await assert.rejects(access(output));
});

test("an empty bundle cannot produce a successful checksum manifest", async () => {
  const { bundle, output } = await fixture();
  await asset(bundle, "notes.txt");
  await assert.rejects(run(process.execPath, [script, bundle, output]), /No release artifacts found/);
  await assert.rejects(access(output));
});

const tag = "v1.0.25-beta.1", repository = "example/Yomikura";
const updater = () => ({ version: "1.0.25-beta.1", platforms: Object.fromEntries(["windows-x86_64", "linux-x86_64", "darwin-aarch64"].map((target) => [target, { url: `https://github.com/${repository}/releases/download/${tag}/${target}.zip`, signature: "fixture-signature" }])) });

test("updater targets point to assets in the expected repository and release", () => {
  assert.equal(inspectUpdaterManifest(updater(), tag, repository).length, 3);
});

test("updater metadata cannot mix versions, repositories or nested asset paths", () => {
  const stale = updater(); stale.version = "1.0.24";
  assert.throws(() => inspectUpdaterManifest(stale, tag, repository), /version must match/);
  for (const url of [`https://github.com/other/project/releases/download/${tag}/app.zip`, `https://github.com/${repository}/releases/download/${tag}/folder%2Fapp.zip`]) {
    const changed = updater(); changed.platforms["windows-x86_64"].url = url;
    assert.throws(() => inspectUpdaterManifest(changed, tag, repository));
  }
});

test("updater metadata needs platform mappings and nonempty signatures", () => {
  const missing = updater(); delete missing.platforms["windows-x86_64"];
  assert.throws(() => inspectUpdaterManifest(missing, tag, repository), /Missing Windows/);
  const unsigned = updater(); unsigned.platforms["windows-x86_64"].signature = "";
  assert.throws(() => inspectUpdaterManifest(unsigned, tag, repository), /Missing updater signature/);
});
