import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { verifyProgressAfterStop } from './fixtures/verify-progress-after-stop.mjs';
import { verifyDeviceRecovery } from './fixtures/verify-device-recovery.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Use a disposable GitHub runner.');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.ok(process.env.RUNNER_TEMP && process.env.JAVA_HOME && process.env.YOMIKURA_PRIVATE_JAVA && process.env.APPDATA);

const baseline = {
  version: '2.3.2243',
  sha256: '821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5',
};
const candidate = {
  version: '2.4.2373',
  sha256: 'dd05d523cc785b7acf90c9feac0bc84c53d5fb3af5ab2a33653646e2076e5217',
};
const output = path.resolve('.cache/extension-migration');
await mkdir(output, { recursive: true });
const root = await mkdtemp(path.join(output, 'run-'));
const library = path.join(root, 'baseline-library');
const migratedLibrary = path.join(root, 'migrated-library');
const pkg = 'app.yomikura.fixture';
const sourceName = 'Yomikura migration source';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);
const jdk = (tool) => path.join(process.env.JAVA_HOME, 'bin', `${tool}.exe`);
const java = path.join(process.env.YOMIKURA_PRIVATE_JAVA, 'bin', 'java.exe');
const report = { baseline: baseline.version, candidate: candidate.version, checks: [] };
let backend, desktop, browser, web, media, mediaAvailable = true, mediaRequests = 0;

async function listen(server) {
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

const reservation = createServer();
const origin = await listen(reservation);
await new Promise((resolve) => reservation.close(resolve));

async function waitFor(description, check, timeout = 90000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(400);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`, { cause: lastError });
}

async function runtimeJar({ version, sha256 }) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(sha256, /^[0-9a-f]{64}$/);
  const name = `Suwayomi-Server-v${version}.jar`;
  const filename = path.join(root, name);
  const response = await fetch(`https://github.com/Suwayomi/Suwayomi-Server/releases/download/v${version}/${name}`, { signal: AbortSignal.timeout(120000) });
  assert.equal(response.ok, true, `Could not download Suwayomi ${version}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(bytes), sha256);
  await writeFile(filename, bytes);
  return filename;
}

async function graphql(query, variables, multipart) {
  const response = await fetch(`${origin}/api/graphql`, {
    method: 'POST',
    headers: multipart ? undefined : { 'content-type': 'application/json' },
    body: multipart ?? JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(35000),
  });
  const result = await response.json();
  assert.ok(response.ok && result.data && !result.errors?.length, JSON.stringify(result.errors ?? response.status));
  return result.data;
}

async function startBackend(name, jar, dataPath, mediaOrigin) {
  const log = createWriteStream(path.join(root, `${name}.log`));
  const args = [
    '-Xmx512m', '-XX:ActiveProcessorCount=2',
    `-Dyomikura.fixture.origin=${mediaOrigin}`,
    `-Dsuwayomi.tachidesk.config.server.rootDir=${dataPath}`,
    `-Dsuwayomi.tachidesk.config.server.port=${new URL(origin).port}`,
    '-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1',
    '-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false',
    '-Dsuwayomi.tachidesk.config.server.kcefEnabled=false',
    '-Dsuwayomi.tachidesk.config.server.webUIFlavor=CUSTOM',
    '-Dsuwayomi.tachidesk.config.server.webUIEnabled=true',
    '-jar', jar,
  ];
  backend = spawn(java, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const processFailure = new Promise((_, reject) => {
    backend.once('error', reject);
    backend.once('exit', (code) => reject(new Error(`${name} exited before readiness: ${code}`)));
  });
  backend.stdout.pipe(log, { end: false });
  backend.stderr.pipe(log, { end: false });
  backend.once('close', () => log.end());
  await Promise.race([waitFor(`${name} GraphQL readiness`, async () => (await graphql('{ __typename }')).__typename, 240000), processFailure]);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.kill();
  await Promise.race([closed, delay(15000).then(() => {
    if (child.exitCode === null && child.signalCode === null) throw new Error('Runner fixture process did not stop');
  })]);
}

async function installFixture(jar) {
  const fixture = path.resolve('scripts/fixtures/suwayomi-extension');
  const classes = path.join(root, 'classes');
  const extension = path.join(root, 'yomikura-migration-fixture.jar');
  if (jar) {
    await mkdir(classes);
    await run(jdk('javac'), ['--release', '21', '-cp', jar, '-d', classes, path.join(fixture, 'MigrationSource.java')]);
    await run(jdk('jar'), ['--create', '--file', extension, '-C', classes, '.', '-C', fixture, 'AndroidManifest.xml']);
  }
  const form = new FormData();
  form.append('operations', JSON.stringify({ query: 'mutation($file:Upload!){ installExternalExtension(input:{extensionFile:$file}){ extension { pkgName versionName isInstalled } } }', variables: { file: null } }));
  form.append('map', JSON.stringify({ 0: ['variables.file'] }));
  form.append('0', new File([await readFile(extension)], path.basename(extension), { type: 'application/java-archive' }));
  const { installExternalExtension } = await graphql(null, null, form);
  return installExternalExtension.extension;
}

async function chapterState(id) {
  return (await graphql('query($id:Int!){ chapter(id:$id){ id name sourceOrder pageCount isRead lastPageRead lastReadAt isBookmarked isDownloaded manga { id title inLibrary } } }', { id })).chapter;
}

async function libraryMarker() {
  const { metas } = await graphql('{ metas(condition:{key:"yomikura.library.identity.v1"},first:2){nodes{value}} }');
  assert.equal(metas.nodes.length, 1);
  return metas.nodes[0].value;
}

async function sourceCatalog(sourceId) {
  return (await graphql('mutation($source:LongString!){ fetchSourceManga(input:{ source:$source,type:POPULAR,page:1 }){ mangas { id title } } }', { source: sourceId })).fetchSourceManga.mangas;
}

async function pageDigests(chapter) {
  const { fetchChapterPages } = await graphql('mutation($id:Int!){fetchChapterPages(input:{chapterId:$id}){pages}}', { id: chapter.id });
  assert.equal(fetchChapterPages.pages.length, 3);
  return Promise.all(fetchChapterPages.pages.map(async (page, index) => {
    const url = new URL(page, origin);
    assert.equal(url.origin, origin, 'The retained page must be served by Suwayomi');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    assert.equal(response.ok, true, `Could not read page ${index + 1}`);
    return hash(Buffer.from(await response.arrayBuffer()));
  }));
}

const settings = JSON.stringify({ version: 0, state: {
  serverBaseUrl: origin, serverDataPath: '', mockMode: false, connectionStatus: 'connected',
  profiles: [{ id: 'migration-fixture', name: 'Migration fixture', url: origin }],
  activeProfileId: 'migration-fixture', readerMode: 'LTR', reducedMotion: true,
  backupIntervalHours: 0, autoDeleteReadChapters: false, autoDownloadCount: 0,
} });

async function openDesktop(seedSettings = true) {
  const config = path.join(process.env.APPDATA, 'app.yomikura');
  await mkdir(config, { recursive: true });
  if (seedSettings) await writeFile(path.join(config, 'yomikura-settings.json'), settings, { flag: 'wx' });
  const { stdout } = await run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', String.raw`
    $ErrorActionPreference = 'Stop'
    $entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
      Where-Object { $_.DisplayName -eq 'Yomikura' } | Select-Object -First 1
    if (!$entry) { throw 'Expected the fixture installer to register Yomikura' }
    ($entry.DisplayIcon -replace ',\d+$', '').Trim([char]34)
  `], { windowsHide: true, timeout: 15000 });
  assert.ok(path.isAbsolute(stdout.trim()));
  desktop = spawn(stdout.trim(), [], { windowsHide: true, stdio: 'ignore' });
  const processFailure = new Promise((_, reject) => {
    desktop.once('error', reject);
    desktop.once('exit', (code) => reject(new Error(`Yomikura exited before WebView attachment: ${code}`)));
  });
  const desktopBrowser = await Promise.race([
    waitFor('installed Yomikura WebView', () => chromium.connectOverCDP('http://127.0.0.1:9237', { timeout: 3000 })),
    processFailure,
  ]);
  const page = await waitFor('Yomikura desktop page', () => desktopBrowser.contexts().flatMap((context) => context.pages()).find((item) => /^https?:\/\/tauri\.localhost/.test(item.url())));
  return { desktopBrowser, page, base: new URL(page.url()).origin };
}

const pageImage = (page, number) => page.locator('[id^="reader-page-"]').getByRole('img', { name: `Page ${number}`, exact: true });

try {
  const first = await readFile('public/demo/moonlit-courier-page.webp');
  const second = await readFile('public/demo/paper-garden-page.webp');
  const images = new Map([['/page/1.webp', first], ['/page/2.webp', second], ['/page/3.webp', first]]);
  media = createServer((request, response) => {
    const bytes = images.get(request.url);
    if (bytes) mediaRequests++;
    if (!mediaAvailable || !bytes) { response.writeHead(mediaAvailable ? 404 : 503); response.end(); return; }
    response.writeHead(200, { 'content-type': 'image/webp', 'content-length': bytes.length, 'cache-control': 'no-store' });
    response.end(bytes);
  });
  const mediaOrigin = await listen(media);
  const [oldJar, newJar] = await Promise.all([runtimeJar(baseline), runtimeJar(candidate)]);
  await cp('dist', path.join(library, 'webUI'), { recursive: true });
  await startBackend('baseline', oldJar, library, mediaOrigin);
  const extension = await installFixture(oldJar);
  assert.deepEqual(extension, { pkgName: pkg, versionName: '1.6.1', isInstalled: true });
  const { sources } = await graphql('{ sources { nodes { id name } } }');
  const source = sources.nodes.find((item) => item.name === sourceName);
  assert.ok(source, 'The installed JAR must register a real source');
  const catalog = await sourceCatalog(source.id);
  const book = catalog.find((item) => item.title === 'Migration Story');
  assert.ok(book);
  const details = await graphql('mutation($id:Int!){fetchMangaAndChapters(input:{id:$id,fetchManga:true,fetchChapters:true}){chapters{id chapterNumber}}}', { id: book.id });
  const chapter = details.fetchMangaAndChapters.chapters.find((item) => item.chapterNumber === 1);
  assert.ok(chapter);
  await graphql('mutation($id:Int!){updateManga(input:{id:$id,patch:{inLibrary:true}}){manga{id}}}', { id: book.id });
  report.checks.push('Suwayomi installed the fixture extension and loaded its title and chapters.');

  browser = await chromium.launch();
  web = await browser.newPage({ serviceWorkers: 'block' });
  await web.addInitScript((serialized) => {
    if (!localStorage.getItem('yomikura-settings')) localStorage.setItem('yomikura-settings', serialized);
  }, settings);
  await web.goto(`${origin}/manga/${book.id}`);
  await web.getByRole('button', { name: 'Download Chapter 1 through Suwayomi', exact: true }).click({ timeout: 60000 });
  await waitFor('Suwayomi download completion', async () => (await chapterState(chapter.id)).isDownloaded);
  assert.ok(mediaRequests >= 3, 'Suwayomi did not retrieve the original fixture pages');
  const firstState = await chapterState(chapter.id);
  const bytes = await pageDigests(firstState);
  assert.deepEqual(bytes, [hash(first), hash(second), hash(first)]);
  report.checks.push('The web app queued the extension chapter and Suwayomi served all three downloaded pages with the original checksums.');

  const native = await openDesktop();
  try {
    await native.page.goto(`${native.base}/manga/${book.id}`);
    await native.page.getByRole('button', { name: 'Save Chapter 1 for offline reading', exact: true }).click({ timeout: 60000 });
    await expect(native.page.getByRole('button', { name: 'Remove offline download of Chapter 1', exact: true })).toBeVisible({ timeout: 90000 });
    await native.page.goto(`${native.base}/reader/${chapter.id}`);
    await native.page.getByRole('button', { name: 'Go to page 2', exact: true }).click({ timeout: 45000 });
    await expect(pageImage(native.page, 2)).toHaveCSS('opacity', '1');
    await waitFor('page 2 acknowledged by Suwayomi', async () => (await chapterState(chapter.id)).lastPageRead === 1);
    await graphql('mutation($id:Int!){updateChapter(input:{id:$id,patch:{isBookmarked:true}}){chapter{id}}}', { id: chapter.id });
    await native.page.goto(`${native.base}/manga/${book.id}`);
    const savedState = await chapterState(chapter.id);
    assert.equal(savedState.lastPageRead, 1);
    const marker = await libraryMarker();
    report.checks.push('Installed desktop saved its own offline copy and Suwayomi acknowledged reading page 2.');

    await delay(2000); // Let the fixture server flush, separate from the abrupt-stop test.
    await stopProcess(backend);
    await cp(library, migratedLibrary, { recursive: true, force: false, errorOnExist: true });
    mediaAvailable = false;
    const requestsBeforeMigration = mediaRequests;
    await startBackend('candidate', newJar, migratedLibrary, mediaOrigin);
    assert.equal((await graphql('{ aboutServer { version } }')).aboutServer.version.replace(/^v/, ''), candidate.version);
    assert.equal(await libraryMarker(), marker);
    const migratedExtensions = (await graphql('{ extensions { nodes { pkgName versionName isInstalled } } }')).extensions.nodes;
    assert.deepEqual(migratedExtensions.find((item) => item.pkgName === pkg), extension);
    assert.deepEqual(await sourceCatalog(source.id), catalog);
    assert.deepEqual(await chapterState(chapter.id), savedState);
    assert.deepEqual(await pageDigests(savedState), bytes);
    await web.goto(`${origin}/manga/${book.id}`);
    await expect(web.getByTitle('Downloaded on server', { exact: true })).toBeVisible({ timeout: 45000 });
    await web.goto(`${origin}/reader/${chapter.id}`);
    await expect(pageImage(web, 2)).toHaveCSS('opacity', '1', { timeout: 45000 });
    assert.equal(mediaRequests, requestsBeforeMigration, 'Migrated downloads must load without requesting the source');
    report.checks.push('The migrated JAR still serves its catalog. Suwayomi retained chapter state and all three page digests. Web resumed page 2 with the source unavailable.');
    await web.screenshot({ path: path.join(root, 'migrated-web.png') });

    await stopProcess(backend);
    await native.page.goto(`${native.base}/reader/${chapter.id}`);
    const offlinePage = pageImage(native.page, 2);
    await expect(offlinePage).toHaveAttribute('src', /^blob:/, { timeout: 45000 });
    await expect(offlinePage).toHaveCSS('opacity', '1');
    await native.page.screenshot({ path: path.join(root, 'migrated-desktop-offline.png') });
    report.checks.push('Installed desktop resumed the existing page 2 device copy with Suwayomi stopped.');

    report.abruptProgress = [];
    await verifyProgressAfterStop({
      clients: [{ name: 'desktop', ...native }, { name: 'web', page: web, base: origin }],
      chapterId: chapter.id,
      origin,
      readServerChapter: () => chapterState(chapter.id),
      restartServer: (name) => startBackend(name, newJar, migratedLibrary, mediaOrigin),
      stopServer: () => stopProcess(backend),
      waitFor,
      outcomes: report.abruptProgress,
    });
    report.checks.push('Both readers kept page 2 after each abrupt server stop. Pending writes reached Suwayomi after reconnecting.');

    await verifyDeviceRecovery({
      native, browser, origin, settings, mangaId: book.id, chapterId: chapter.id,
      stopServer: () => stopProcess(backend), startServer: (name) => startBackend(name, newJar, migratedLibrary, mediaOrigin),
      closeDesktop: () => stopProcess(desktop), reopenDesktop: () => openDesktop(false), chapterState, waitFor,
      rebuild: async (page) => {
        await web.close();
        // Capture the upstream backup alongside the portable device file.
        await graphql('mutation($id:Int!){updateChapter(input:{id:$id,patch:{isRead:false,lastPageRead:1}}){chapter{id}}}', { id: chapter.id });
        const { createBackup } = await graphql('mutation { createBackup(input:{}) { url } }');
        const backupUrl = new URL(createBackup.url, origin);
        assert.equal(backupUrl.origin, origin);
        const response = await fetch(backupUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        assert.ok(response.ok);
        const backup = Buffer.from(await response.arrayBuffer());
        await stopProcess(backend);

        const rebuilt = path.join(root, 'rebuilt-library');
        await cp('dist', path.join(rebuilt, 'webUI'), { recursive: true });
        for (let index = 1; index <= 3; index++) {
          const decoy = path.join(rebuilt, 'local', 'Decoy Story', `Chapter ${index}`);
          await mkdir(decoy, { recursive: true });
          await writeFile(path.join(decoy, '001.webp'), first);
        }
        await startBackend('rebuilt-server', newJar, rebuilt, mediaOrigin);
        await installFixture();
        const decoy = (await sourceCatalog('0')).find((item) => item.title === 'Decoy Story');
        assert.ok(decoy);
        const details = (await graphql('mutation($id:Int!){fetchMangaAndChapters(input:{id:$id,fetchManga:true,fetchChapters:true}){chapters{id}}}', { id: decoy.id })).fetchMangaAndChapters;
        assert.ok(details.chapters.length >= 2);
        await graphql('mutation($id:Int!){updateManga(input:{id:$id,patch:{inLibrary:true}}){manga{id}}}', { id: decoy.id });

        await page.goto(`${origin}/settings/backup`);
        await expect(page.getByLabel('Upload & Restore Backup')).toBeEnabled();
        await page.getByLabel('Upload & Restore Backup').setInputFiles({ name: 'fixture.tachibk', mimeType: 'application/gzip', buffer: backup });
        await page.getByRole('alertdialog').getByRole('button', { name: 'Back up and restore' }).click();
        await expect(page.getByText(/Backup restored successfully/).first()).toBeVisible({ timeout: 60000 });
        assert.notEqual(await libraryMarker(), marker);

        const lookup = await graphql('query($source:LongString!){mangas(first:2,condition:{sourceId:$source,inLibrary:true}){nodes{id title}}}', { source: source.id });
        const remapped = lookup.mangas.nodes.find((item) => item.title === book.title);
        assert.ok(remapped);
        const chapters = await graphql('query($id:Int!){chapters(first:5,condition:{mangaId:$id}){nodes{id name}}}', { id: remapped.id });
        const remappedChapter = chapters.chapters.nodes.find((item) => item.name === 'Chapter 1');
        assert.ok(remappedChapter);
        return { mangaId: remapped.id, chapterId: remappedChapter.id, decoyChapterId: details.chapters.find((item) => item.id === chapter.id)?.id ?? details.chapters[0].id };
      },
    });
    report.checks.push('Windows exported device records offline and a portable file while connected. Fresh browser profiles restored into the original library and into a newly restored Suwayomi database that assigned different IDs. Pending progress required review, the decoy chapter was unchanged, and the recovered pages opened offline.');
    report.checks.push('The installed Windows reader also imported the portable file into the rebuilt library, opened the remapped note, and rendered a recovered page with Suwayomi stopped.');
  } finally {
    await native.desktopBrowser.close().catch(() => {});
  }
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = error.stack ?? String(error);
  if (error.cause) report.cause = String(error.cause);
  if (web && !web.isClosed()) await web.screenshot({ path: path.join(root, 'failure-web.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser?.close().catch(() => {});
  await Promise.allSettled([stopProcess(desktop), stopProcess(backend)]);
  media?.closeAllConnections();
  media?.close();
}
