import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { inspectUpdaterManifest } from "./verify-updater-manifest.mjs";
import { reconcileChecksums } from "./reconcile-artifact-checksums.mjs";
import { inspectReleaseOrigin, REQUIRED_RELEASE_BUILDS } from "./verify-release-origin.mjs";

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
  await asset(bundle, "deb/staging/control.tar.gz");
  await asset(bundle, "deb/staging/data.tar.gz");
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

test("architecture-renamed updater archives retain the original build checksum", () => {
  const digest = "a".repeat(64);
  assert.equal(reconcileChecksums(`${digest}  Yomikura.app.tar.gz\n`, [{ name: "Yomikura_aarch64.app.tar.gz", digest }]), `${digest}  Yomikura_aarch64.app.tar.gz\n`);
});

test("a same-named altered upload cannot be replaced by a different matching asset", () => {
  const digest = "a".repeat(64);
  assert.throws(() => reconcileChecksums(`${digest}  Yomikura.exe\n`, [{ name: "Yomikura.exe", digest: "b".repeat(64) }, { name: "Other.exe", digest }]), /Uploaded bytes differ/);
});

test("missing or ambiguous renamed assets cannot produce a passing release manifest", () => {
  const digest = "a".repeat(64), text = `${digest}  Yomikura.app.tar.gz\n`;
  assert.throws(() => reconcileChecksums(text, []), /Missing or ambiguous/);
  assert.throws(() => reconcileChecksums(text, [{ name: "first.app.tar.gz", digest }, { name: "second.app.tar.gz", digest }]), /Missing or ambiguous/);
});

function releaseOrigin() {
  const commit = "a".repeat(40);
  return { run: { event: "push", path: ".github/workflows/publish.yml", head_repository: { full_name: repository }, head_sha: commit }, release: { draft: true, tag_name: tag, target_commitish: commit }, jobs: REQUIRED_RELEASE_BUILDS.map((name) => ({ name, conclusion: "success" })) };
}
test("draft verification can resume after a finalizer failure without rebuilding the app", () => {
  const { run, release, jobs } = releaseOrigin();
  assert.equal(inspectReleaseOrigin(run, release, [...jobs, { name: "Verify and publish release checksums", conclusion: "failure" }], tag, repository), run.head_sha);
});
test("published releases and different source commits cannot be finalized", () => {
  const { run, release, jobs } = releaseOrigin();
  assert.throws(() => inspectReleaseOrigin(run, { ...release, draft: false }, jobs, tag, repository), /unpublished draft/);
  assert.throws(() => inspectReleaseOrigin(run, { ...release, target_commitish: "b".repeat(40) }, jobs, tag, repository), /same commit/);
});
test("a failed or missing platform build cannot be substituted during finalization", () => {
  const { run, release, jobs } = releaseOrigin();
  assert.throws(() => inspectReleaseOrigin(run, release, jobs.slice(0, -1), tag, repository), /build gate did not pass/);
  assert.throws(() => inspectReleaseOrigin(run, release, jobs.map((job) => ({ ...job, conclusion: "failure" })), tag, repository), /build gate did not pass/);
});
test("an unrelated repository or workflow cannot provide the release checksums", () => {
  const { run, release, jobs } = releaseOrigin();
  assert.throws(() => inspectReleaseOrigin({ ...run, head_repository: { full_name: "other/project" } }, release, jobs, tag, repository), /this repository/);
  assert.throws(() => inspectReleaseOrigin({ ...run, path: ".github/workflows/verify.yml" }, release, jobs, tag, repository), /release build workflow/);
});

test("legacy Debian staging entries do not become downloadable installer checksums", () => {
  const digest = "a".repeat(64);
  const manifest = `${digest}  Yomikura.deb\n${"b".repeat(64)}  control.tar.gz\n${"c".repeat(64)}  data.tar.gz\n`;
  assert.equal(reconcileChecksums(manifest, [{ name: "Yomikura.deb", digest }]), `${digest}  Yomikura.deb\n`);
});

test("staging-only manifests and accidental staging uploads cannot pass", () => {
  const digest = "a".repeat(64), manifest = `${digest}  control.tar.gz\n`;
  assert.throws(() => reconcileChecksums(manifest, []), /No distributable build checksums/);
  assert.throws(() => reconcileChecksums(manifest, [{ name: "control.tar.gz", digest }]), /staging archive was uploaded/);
});
