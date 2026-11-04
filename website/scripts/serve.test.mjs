import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serve } from "./serve.mjs";

test("preview serves only the public snapshot, without following request paths or symlinks", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "yomikura-preview-test-"));
  const root = path.join(folder, "public"); await mkdir(root);
  await writeFile(path.join(root, "index.html"), "public page");
  await writeFile(path.join(root, ".private"), "private data");
  await writeFile(path.join(folder, "secret.txt"), "outside data");
  await symlink(path.join(folder, "secret.txt"), path.join(root, "shortcut.txt"));
  const site = await serve(root, { port: 0 });
  try {
    await writeFile(path.join(root, "index.html"), "changed after snapshot");
    const response = await fetch(site.origin + "/Yomikura/");
    assert.equal(await response.text(), "public page");
    for (const suffix of [".private", "shortcut.txt", "%2e%2e%5csecret.txt", "missing.txt"]) {
      const result = await fetch(site.origin + "/Yomikura/" + suffix);
      assert.ok(result.status === 403 || result.status === 404);
    }
    assert.equal((await fetch(site.origin + "/Yomikura/", { method: "POST" })).status, 405);
    const head = await fetch(site.origin + "/Yomikura/", { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    assert.equal(head.headers.get("x-content-type-options"), "nosniff");
  } finally { await site.close(); }
});
