import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import {
  downloadSuwayomi, makeFixtureCertificate, sha256, startFixtureProxy, startSuwayomi,
  stopFixtureServer, stopSuwayomi, waitForFixture,
} from './fixtures/hosted-suwayomi.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Linux');
const sourceCommit = process.env.YOMIKURA_HOSTED_COMMIT;
assert.match(sourceCommit, /^[a-f\d]{40}$/);
const exec = promisify(execFile);
const output = path.resolve('.cache/hosted-web-verification');
const library = path.join(output, 'library');
const hostname = 'reader.yomikura.test';
const certificateName = `Yomikura hosted fixture ${randomUUID()}`;
const password = randomUUID();
const username = 'fixture-reader';
const upstream = new URL('http://127.0.0.1:4599');
const checks = { commit: sourceCommit, environment: 'Disposable Ubuntu runner and Chromium', passed: [] };
let server, proxy, browser, media, database, importedCertificate = false;

async function trustFixtureCertificate() {
  const certificate = await makeFixtureCertificate(output, hostname);
  // Chromium prefers the legacy database if it exists. Initialize it only on this runner.
  const nss = path.join(homedir(), '.pki', 'nssdb');
  database = `sql:${nss}`;
  await mkdir(nss, { recursive: true });
  if (!await stat(path.join(nss, 'cert9.db')).catch(() => false)) await exec('certutil', ['-N', '-d', database, '--empty-password']);
  await exec('certutil', ['-A', '-d', database, '-n', certificateName, '-t', 'C,,', '-i', certificate.ca]);
  importedCertificate = true;
  return certificate;
}

function expectOperation(page, name) {
  return page.waitForResponse((response) =>
    response.url().endsWith('/api/graphql') && response.request().method() === 'POST'
    && response.request().postDataJSON()?.operationName === name)
    .then(async (response) => {
      const json = await response.json();
      assert.ok(response.ok() && json.data && !json.errors?.length, `Suwayomi did not confirm ${name}`);
      return json.data;
    });
}

async function installSource(page, jar) {
  const fixture = path.resolve('scripts/fixtures/suwayomi-extension');
  const classes = path.join(output, 'classes'), extension = path.join(output, 'hosted-fixture.jar');
  await mkdir(classes, { recursive: true });
  await exec('javac', ['--release', '21', '-cp', jar, '-d', classes, path.join(fixture, 'MigrationSource.java')]);
  await exec('jar', ['--create', '--file', extension, '-C', classes, '.', '-C', fixture, 'AndroidManifest.xml']);
  const installed = await page.evaluate(async (encoded) => {
    const form = new FormData();
    form.append('operations', JSON.stringify({ query: 'mutation($file:Upload!){installExternalExtension(input:{extensionFile:$file}){extension{pkgName isInstalled}}}', variables: { file: null } }));
    form.append('map', JSON.stringify({ 0: ['variables.file'] }));
    form.append('0', new File([Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))], 'hosted-fixture.jar'));
    const response = await fetch('/api/graphql', { method: 'POST', body: form });
    return (await response.json()).data?.installExternalExtension?.extension;
  }, (await readFile(extension)).toString('base64'));
  assert.deepEqual(installed, { pkgName: 'app.yomikura.fixture', isInstalled: true });
}

async function queryFromReader(page, base, query, variables) {
  const result = await page.evaluate(async ({ endpoint, query, variables }) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    return { status: response.status, body: await response.json() };
  }, { endpoint: base + '/api/graphql', query, variables });
  assert.ok(result.status === 200 && result.body.data && !result.body.errors?.length, JSON.stringify(result.body.errors ?? result.status));
  return result.body.data;
}

async function openHostedReader(base) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(18000);
  await page.goto(base + '/setup');
  await expect(page.locator('form input[name="user"]')).toBeVisible();
  await page.locator('form input[name="user"]').fill(username);
  await page.locator('form input[name="pass"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Your browser. Your reading room.' })).toBeVisible({ timeout: 12000 });
  assert.ok(await page.evaluate(() => location.protocol === 'https:' && isSecureContext));
  await page.getByLabel('Your Suwayomi address', { exact: true }).fill(base);
  await page.getByRole('button', { name: 'Connect my library', exact: true }).click();
  await expect(page.getByText('Your library is connected. Next, choose your sources below.', { exact: true })).toBeVisible();
  return page;
}

async function expectSavedPages(page, base, chapterId, expected) {
  const readerUrl = `${base}/reader/${chapterId}`;
  await page.goto(readerUrl);
  assert.equal(page.url(), readerUrl);
  for (const [index, hash] of expected.entries()) {
    const number = index + 1;
    await page.getByRole('button', { name: `Go to page ${number}`, exact: true }).click();
    const image = page.locator('[id^="reader-page-"]').getByRole('img', { name: `Page ${number}`, exact: true });
    await expect(image).toHaveCSS('opacity', '1');
    const displayedHash = await image.evaluate(async (element) => {
      const response = await fetch(element.src, { cache: 'no-store' });
      if (!response.ok) throw new Error('The authenticated page could not be read');
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    });
    assert.equal(displayedHash, hash, `Saved page ${number} differs from the original source`);
  }
}

try {
  await mkdir(library, { recursive: true });
  const artifacts = process.env.YOMIKURA_HOSTED_ARTIFACT;
  const zips = (await readdir(artifacts)).filter((name) => /^Yomikura-web-[\w.-]+\.zip$/.test(name));
  assert.equal(zips.length, 1, 'Expected exactly one previously tested web ZIP');
  const archive = path.join(artifacts, zips[0]);
  const checksum = (await readFile(archive + '.sha256', 'utf8')).trim().split(/\s+/)[0];
  assert.equal(sha256(await readFile(archive)), checksum, 'Web ZIP differs from its verified checksum');
  const webUI = path.join(library, 'webUI');
  await exec('python3', ['-m', 'zipfile', '-e', archive, webUI]);
  const provenance = JSON.parse(await readFile(path.join(webUI, 'source.json'), 'utf8'));
  assert.equal(provenance.commit, sourceCommit);
  assert.equal(provenance.repository, `https://github.com/${process.env.GITHUB_REPOSITORY}`);
  checks.webZipSha256 = checksum;

  const first = await readFile('public/demo/moonlit-courier-page.webp');
  const second = await readFile('public/demo/paper-garden-page.webp');
  const fixturePages = [first, second, first];
  const expected = fixturePages.map(sha256);
  const requestedPages = new Set();
  media = createServer((incoming, outgoing) => {
    const index = /^\/page\/(\d)\.webp$/.exec(incoming.url)?.[1];
    const bytes = index && fixturePages[Number(index) - 1];
    if (!bytes) return outgoing.writeHead(404).end();
    requestedPages.add(index);
    outgoing.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'no-store' }).end(bytes);
  });
  media.listen(0, upstream.hostname);
  await once(media, 'listening');
  const mediaAddress = `http://127.0.0.1:${media.address().port}`;
  const jar = await downloadSuwayomi(output);
  async function boot(subpath = '') {
    server = startSuwayomi(jar, {
      rootDir: library, port: upstream.port, webUISubpath: subpath, webUIFlavor: 'CUSTOM',
      authMode: 'SIMPLE_LOGIN', authUsername: username, authPassword: password,
    }, [`-Dyomikura.fixture.origin=${mediaAddress}`]);
    await waitForFixture('the Suwayomi login page', async () => {
      const response = await fetch(new URL(`${subpath}/login.html`, upstream), { signal: AbortSignal.timeout(1500) });
      return response.ok && (await response.text()).includes('name="pass"');
    }, 120000);
  }
  await boot();
  proxy = await startFixtureProxy(await trustFixtureCertificate(), upstream);
  const origin = `https://${hostname}:${proxy.address().port}`;
  browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${hostname} ${upstream.hostname}`] });
  const page = await openHostedReader(origin);
  checks.passed.push('Trusted HTTPS, normal Suwayomi sign-in and Yomikura setup worked with the extracted ZIP');

  await installSource(page, jar);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Add books', exact: true }).click();
  await page.getByRole('link', { name: 'Browse Yomikura migration source', exact: true }).click();
  await page.getByRole('link', { name: 'Migration Story', exact: true }).click();
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In Library', exact: true })).toBeVisible();
  const mangaId = Number(new URL(page.url()).pathname.split('/').at(-1));
  const { manga } = await queryFromReader(page, origin, 'query($id:Int!){manga(id:$id){chapters{nodes{id name}}}}', { id: mangaId });
  const chapterId = manga.chapters.nodes.find((chapter) => chapter.name === 'Chapter 1')?.id;
  assert.ok(Number.isSafeInteger(chapterId));

  const enqueue = expectOperation(page, 'EnqueueChapterDownload');
  await page.getByRole('button', { name: 'Download Chapter 1 through Suwayomi', exact: true }).click();
  assert.ok((await enqueue).enqueueChapterDownload?.downloadStatus);
  const queue = expectOperation(page, 'GetDownloadStatus');
  await page.getByRole('link', { name: 'Downloads', exact: true }).click();
  assert.ok(Array.isArray((await queue).downloadStatus?.queue));
  await expect(page.getByRole('heading', { name: 'Downloads', exact: true })).toBeVisible();
  async function chapterState(reader, base) {
    const result = await queryFromReader(reader, base, 'query($id:Int!){chapter(id:$id){isDownloaded pageCount}}', { id: chapterId });
    return result.chapter;
  }
  await waitForFixture('Suwayomi to complete the chapter', async () => (await chapterState(page, origin)).isDownloaded);
  assert.deepEqual([...requestedPages].sort(), ['1', '2', '3']);
  checks.passed.push('The signed-in browser queued the extension chapter and Suwayomi downloaded all three source pages');

  await page.context().close();
  await stopFixtureServer(media);
  assert.equal(media.listening, false);
  await stopSuwayomi(server);
  await boot();
  const fresh = await openHostedReader(origin);
  assert.deepEqual(await chapterState(fresh, origin), { isDownloaded: true, pageCount: expected.length });
  await expectSavedPages(fresh, origin, chapterId, expected);
  checks.download = { result: 'PASS', pages: expected.length, sourceStopped: true, restartedServer: true, freshBrowserContext: true };
  checks.passed.push('After the source stopped and Suwayomi restarted, a fresh authenticated browser decoded all three saved pages and matched their SHA-256 hashes');

  if (process.env.YOMIKURA_HOSTING_JOURNEY === '1') {
    await fresh.context().close();
    await stopSuwayomi(server);
    const subpath = '/yomikura';
    await boot(subpath);
    const root = origin + subpath;
    const rejected = await fetch(new URL('/api/graphql', upstream), { method: 'POST', redirect: 'manual' });
    assert.ok(!rejected.ok, 'The fixture must expose its API under the subpath');
    checks.subpath = { path: subpath + '/', result: 'FAIL' };
    const mounted = await openHostedReader(root);
    const logo = mounted.locator('img.yomi-logo-image').first();
    await expect.poll(() => logo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    assert.match(await logo.evaluate((image) => new URL(image.src).pathname), /^\/yomikura\/identity\//);
    await mounted.getByRole('link', { name: 'Start the browser guide', exact: true }).click();
    await expect(mounted).toHaveURL(root + '/setup#guide-install');
    await mounted.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(mounted).toHaveURL(root + '/library');
    await expect(mounted.getByRole('link', { name: 'Migration Story', exact: true })).toBeVisible();
    assert.ok((await chapterState(mounted, root)).isDownloaded);
    await expectSavedPages(mounted, root, chapterId, expected);
    await mounted.reload();
    await expect(mounted.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 1', exact: true })).toBeVisible();
    const scope = await waitForFixture('the scoped service worker', () => mounted.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active ? registration.scope : null;
    }), 18000);
    assert.equal(scope, root + '/');
    checks.subpath.serviceWorkerScope = new URL(scope).pathname;
    checks.subpath.result = 'PASS';
    checks.passed.push('The exact ZIP signed in, navigated, loaded saved images and refreshed a reader deep link under Suwayomi’s subpath');
  }
  checks.result = 'PASS';
} catch (error) {
  checks.result = 'FAIL';
  checks.failure = String(error).replaceAll(password, '[fixture password]');
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopFixtureServer(media);
  await stopFixtureServer(proxy);
  await stopSuwayomi(server);
  if (importedCertificate) await exec('certutil', ['-D', '-d', database, '-n', certificateName]);
  await writeFile(path.join(output, 'result.json'), JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
}
