// Runs only on the disposable CI runner, against two private temporary databases.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { createServer } from "vite";

if (process.env.CI !== "true") throw new Error("Run the live identity test on the disposable CI runner only.");
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const jar = argument("jar"), java = argument("java");
if (!jar || !java) throw new Error("Provide the pinned --jar and CI --java paths.");
const output = path.resolve(".cache/library-identity-live");
await mkdir(output, { recursive: true });
const root = await mkdtemp(path.join(output, "run-"));
const reservation = createNetServer();
await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const compiler = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
const { establishLibraryIdentity, verifyLibraryIdentity } = await compiler.ssrLoadModule("/src/api/suwayomi/libraryIdentity.ts");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function graphql(query, variables) {
  const response = await fetch(`${base}/api/graphql`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(5000) });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) throw new Error(JSON.stringify(result.errors ?? response.status));
  return result.data;
}
async function withLibrary(name, callback) {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  const chapterFolder = path.join(directory, "local", "Identity fixture", "Chapter 1");
  await mkdir(chapterFolder, { recursive: true });
  await copyFile(path.resolve("public/demo/paper-garden-page.webp"), path.join(chapterFolder, "001.webp"));
  const log = createWriteStream(path.join(root, `${name}-${Date.now()}.log`));
  const child = spawn(java, [
    `-Dsuwayomi.tachidesk.config.server.rootDir=${directory}`,
    `-Dsuwayomi.tachidesk.config.server.port=${port}`,
    "-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1",
    "-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false",
    "-Dsuwayomi.tachidesk.config.server.kcefEnabled=false", "-jar", jar,
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  let stopped = false, spawnError;
  child.once("error", (error) => { spawnError = error; });
  const exited = new Promise((resolve) => child.once("exit", () => { stopped = true; resolve(); }));
  try {
    const deadline = Date.now() + 240000;
    while (true) {
      if (spawnError) throw spawnError;
      if (stopped) throw new Error(`${name} exited before readiness; inspect its retained log.`);
      try { await graphql("query IdentityReadiness { __typename }"); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await pause(1000); }
    }
    return await callback();
  } finally {
    if (!stopped) child.kill();
    await Promise.race([exited, pause(15000).then(() => { if (!stopped) throw new Error("The isolated backend did not stop."); })]);
    log.end();
  }
}
async function fixtureChapter() {
  const catalog = await graphql('mutation IdentityCatalog { fetchSourceManga(input: { source: "0", type: POPULAR, page: 1 }) { mangas { id title } } }');
  const manga = catalog.fetchSourceManga.mangas.find((item) => item.title === "Identity fixture");
  assert.ok(manga, "The synthetic Local title must be discoverable");
  const details = await graphql("mutation IdentityChapters($id: Int!) { fetchMangaAndChapters(input: { id: $id, fetchManga: true, fetchChapters: true }) { chapters { id name chapterNumber } } }", { id: manga.id });
  assert.equal(details.fetchMangaAndChapters.chapters.length, 1);
  return { mangaId: manga.id, ...details.fetchMangaAndChapters.chapters[0] };
}
try {
  let firstChapter;
  const first = await withLibrary("first-library", async () => {
    firstChapter = await fixtureChapter();
    await graphql("mutation IdentityRead($id: Int!) { updateChapter(input: { id: $id, patch: { isRead: true } }) { chapter { id isRead } } }", { id: firstChapter.id });
    const identity = await establishLibraryIdentity(base);
    await verifyLibraryIdentity(base, identity);
    const backup = await graphql("mutation IdentityBackup { createBackup(input: {}) { url } }");
    assert.ok(backup.createBackup.url);
    return identity;
  });
  await withLibrary("second-library", async () => {
    const secondChapter = await fixtureChapter();
    assert.deepEqual(secondChapter, firstChapter, "The databases must deliberately reuse the same comic and chapter identities");
    await assert.rejects(verifyLibraryIdentity(base, first), /changed/);
    const unchanged = await graphql("query IdentityUnchanged($id: Int!) { chapter(id: $id) { isRead } }", { id: secondChapter.id });
    assert.equal(unchanged.chapter.isRead, false);
    const second = await establishLibraryIdentity(base);
    assert.notEqual(second.marker, first.marker);
    await verifyLibraryIdentity(base, second);
    await assert.rejects(verifyLibraryIdentity(base, first), /changed/);
    const backup = await graphql("mutation IdentityBackup { createBackup(input: {}) { url } }");
    assert.ok(backup.createBackup.url);
  });
  await withLibrary("first-library", async () => {
    assert.deepEqual(await establishLibraryIdentity(base), first);
    await verifyLibraryIdentity(base, first);
  });
  console.log("PASS: two real Suwayomi databases reused one endpoint; markers stayed distinct, stale identity was rejected, exports succeeded, and the first identity survived restart.");
} finally { await compiler.close(); }
