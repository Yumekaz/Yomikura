import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

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
