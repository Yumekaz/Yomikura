// Runs only on the disposable CI runner, against two private temporary databases.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { createServer } from "vite";
import { IDBFactory } from "fake-indexeddb";

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
const compiler = await createServer({ configFile: false, server: { middlewareMode: true, watch: { ignored: ["**/.cache/**"] } }, appType: "custom" });
// Exercise the production data services with isolated client storage as well.
// No browser profile, installed app, or personal library is used by this runner.
const localValues = new Map();
globalThis.localStorage = { getItem: (key) => localValues.get(key) ?? null, setItem: (key, value) => localValues.set(key, value), removeItem: (key) => localValues.delete(key) };
globalThis.indexedDB = new IDBFactory();
globalThis.window = Object.assign(new EventTarget(), { setInterval, clearInterval, setTimeout, clearTimeout, location: { origin: "http://client-fixture.example" } });
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
const { establishLibraryIdentity, readLibraryIdentity, verifyLibraryIdentity, replaceLibraryIdentity } = await compiler.ssrLoadModule("/src/api/suwayomi/libraryIdentity.ts");
const { useSettingsStore } = await compiler.ssrLoadModule("/src/stores/useSettingsStore.ts");
await useSettingsStore.persist.rehydrate();
useSettingsStore.setState({ hasHydrated: true, serverBaseUrl: base, mockMode: false, connectionStatus: "connected", backupIntervalHours: 0, autoDeleteReadChapters: false, autoDownloadCount: 0 });
const { progressBackend } = await compiler.ssrLoadModule("/src/api/suwayomi/backendIdentity.ts");
const { rememberLibrary, assertLibrarySession } = await compiler.ssrLoadModule("/src/api/suwayomi/librarySession.ts");
const { createGraphqlClient } = await compiler.ssrLoadModule("/src/api/graphql/client.ts");
const { saveProgressIntent, synchronizeProgress, resolveProgressConflict, progressChapterIdentity } = await compiler.ssrLoadModule("/src/api/suwayomi/progressSync.ts");
const { getProgressOperations, getEarlierProgress } = await compiler.ssrLoadModule("/src/api/suwayomi/progressStorage.ts");
const { createLibraryBackup } = await compiler.ssrLoadModule("/src/api/suwayomi/libraryBackups.ts");
const { readLibraryBackup } = await compiler.ssrLoadModule("/src/api/suwayomi/backupStorage.ts");
const { beginLibraryRestore, recordLibraryRestore, finishLibraryRestore, pendingLibraryRestore } = await compiler.ssrLoadModule("/src/api/suwayomi/restoreIdentity.ts");
const { restoreBackupUpload } = await compiler.ssrLoadModule("/src/api/suwayomi/backupUpload.ts");
const { waitForRestoreStatus } = await compiler.ssrLoadModule("/src/components/settings/backupRestore.ts");
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
    const result = await callback();
    // Windows child.kill() is immediate termination, not a graceful JVM exit.
    // Check an idle restart here; the first abrupt-stop attempt is retained as a failure.
    await pause(2000);
    return result;
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
  let firstChapter, firstArchive, firstClient;
  const first = await withLibrary("first-library", async () => {
    firstChapter = await fixtureChapter();
    await graphql("mutation IdentityRead($id: Int!) { updateChapter(input: { id: $id, patch: { isRead: true } }) { chapter { id isRead } } }", { id: firstChapter.id });
    const identity = await establishLibraryIdentity(base);
    console.log(`First library marker: ${identity.marker}`);
    await verifyLibraryIdentity(base, identity);
    await graphql("mutation IdentityAdd($id: Int!) { updateManga(input: { id: $id, patch: { inLibrary: true } }) { manga { id } } }", { id: firstChapter.mangaId });
    rememberLibrary(base, identity);
    firstClient = createGraphqlClient(`${base}/api/graphql`, undefined, "live");
    const backup = await createLibraryBackup(firstClient, base, "manual");
    firstArchive = (await readLibraryBackup(base, backup.id)).bytes;
    assert.equal(backup.libraryId, identity.marker);
    const chapter = (await firstClient.GetChapter({ id: firstChapter.id })).chapter;
    const saved = await saveProgressIntent(progressBackend(base), { kind: "explicit", chapter: progressChapterIdentity(chapter), baseline: { isRead: chapter.isRead, lastPageRead: chapter.lastPageRead }, patch: { isBookmarked: true } });
    assert.equal(saved.accepted, true);
    assert.equal((await getProgressOperations(progressBackend(base))).length, 1);
    return identity;
  });
  await withLibrary("second-library", async () => {
    const secondChapter = await fixtureChapter();
    assert.deepEqual(secondChapter, firstChapter, "The databases must deliberately reuse the same comic and chapter identities");
    await assert.rejects(verifyLibraryIdentity(base, first), /changed/);
    const unchanged = await graphql("query IdentityUnchanged($id: Int!) { chapter(id: $id) { isRead } }", { id: secondChapter.id });
    assert.equal(unchanged.chapter.isRead, false);
    const second = await establishLibraryIdentity(base);
    console.log(`Second library marker: ${second.marker}`);
    assert.notEqual(second.marker, first.marker);
    await verifyLibraryIdentity(base, second);
    await assert.rejects(verifyLibraryIdentity(base, first), /changed/);
    rememberLibrary(base, second);
    const secondBackend = progressBackend(base), secondClient = createGraphqlClient(`${base}/api/graphql`, undefined, "live");
    await synchronizeProgress(secondBackend);
    const quarantined = await getProgressOperations(secondBackend);
    assert.equal(quarantined.length, 1); assert.equal(quarantined[0].status, "blocked"); assert.equal(quarantined[0].libraryId, first.marker);
    await assert.rejects(firstClient.UpdateChapterProgress({ input: { id: secondChapter.id, patch: { isBookmarked: true } } }), /different library/);
    assert.equal((await secondClient.GetChapter({ id: secondChapter.id })).chapter.isBookmarked, false);
    await resolveProgressConflict(secondBackend, secondChapter.id, false, quarantined[0].sequence);
    assert.equal((await getProgressOperations(secondBackend)).length, 0);
    assert.ok((await getEarlierProgress(base)).some((head) => head.libraryId === first.marker));
    const chapter = (await secondClient.GetChapter({ id: secondChapter.id })).chapter;
    assert.equal((await saveProgressIntent(secondBackend, { kind: "explicit", chapter: progressChapterIdentity(chapter), baseline: { isRead: chapter.isRead, lastPageRead: chapter.lastPageRead }, patch: { isBookmarked: true } })).accepted, true);
    const safety = await createLibraryBackup(secondClient, base, "safety");
    assert.equal(safety.libraryId, second.marker);
    assert.ok((await readLibraryBackup(base, safety.id)).bytes.length);
    const token = beginLibraryRestore(base);
    await assert.rejects(assertLibrarySession(base, second.marker), /restore/);
    const restore = await restoreBackupUpload(`${base}/api/graphql`, new File([firstArchive], "first-library.tachibk", { type: "application/gzip" }));
    recordLibraryRestore(base, token, restore.id);
    const completed = await waitForRestoreStatus((id) => secondClient.GetRestoreStatus({ id }), restore.id);
    assert.equal(completed.completed, true);
    await finishLibraryRestore(base, token);
    assert.equal(pendingLibraryRestore(base), undefined);
    const restored = await readLibraryIdentity(base);
    assert.ok(restored); assert.notEqual(restored.marker, first.marker); assert.notEqual(restored.marker, second.marker);
    await synchronizeProgress(progressBackend(base));
    const preRestore = await getProgressOperations(progressBackend(base));
    assert.equal(preRestore.length, 1); assert.equal(preRestore[0].status, "blocked"); assert.equal(preRestore[0].libraryId, second.marker);
    const restoredClient = createGraphqlClient(`${base}/api/graphql`, undefined, "live");
    assert.equal((await restoredClient.GetChapter({ id: secondChapter.id })).chapter.isBookmarked, false);
    assert.equal((await restoredClient.GetChapter({ id: secondChapter.id })).chapter.isRead, true);
    console.log("PASS: production replay quarantined earlier pending progress, explicit review retained an archived record, a verified safety copy preceded real restore, and pre-restore work stayed blocked after marker renewal.");
    // Simulate a clone/restore that carries the first library's client marker.
    await graphql('mutation IdentityClone($value: String!) { setGlobalMeta(input: { meta: { key: "yomikura.library.identity.v1", value: $value } }) { meta { value } } }', { value: first.marker });
    const separated = await replaceLibraryIdentity(base, first);
    assert.notEqual(separated.marker, first.marker);
    await verifyLibraryIdentity(base, separated);
    await assert.rejects(verifyLibraryIdentity(base, first), /changed/);
    const backup = await graphql("mutation IdentityBackup { createBackup(input: {}) { url } }");
    assert.ok(backup.createBackup.url);
  });
  await withLibrary("first-library", async () => {
    const reopened = await readLibraryIdentity(base);
    console.log(`Reopened first library marker: ${reopened?.marker ?? "MISSING"}`);
    assert.deepEqual(reopened, first);
    await verifyLibraryIdentity(base, first);
  });
  console.log("PASS: two real Suwayomi databases reused one endpoint; stale progress and mutations were rejected, backup/restore and copied-marker separation succeeded, and the first identity survived idle restart.");
} finally { await compiler.close(); }
