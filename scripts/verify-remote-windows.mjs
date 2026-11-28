import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import {
  downloadSuwayomi, makeFixtureCertificate, sha256, startFixtureProxy, startSuwayomi,
  stopFixtureServer, stopSuwayomi, waitForFixture,
} from './fixtures/hosted-suwayomi.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.match(process.env.YOMIKURA_TESTED_COMMIT, /^[a-f0-9]{40}$/);
const exec = promisify(execFile);
const output = path.resolve('.cache/remote-windows-verification');
const library = path.join(output, 'library');
const username = 'fixture-reader', password = randomUUID();
const title = 'Protected Reading';
const originalPages = ['paper-garden-page', 'moonlit-courier-page', 'paper-garden-page', 'moonlit-courier-page'];
const upstream = new URL('http://127.0.0.1:4599');
const report = { commit: process.env.YOMIKURA_TESTED_COMMIT, verificationCommit: process.env.GITHUB_SHA, cases: {} };
let backend, proxy, alternateProxy, edge, webview, app, page, trustedCa;

async function updateFixtureTrust(ca, operation) {
  const command = String.raw`
    $ErrorActionPreference = 'Stop'
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($env:YOMIKURA_FIXTURE_CA)
    $store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'LocalMachine')
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    try {
      if ($env:YOMIKURA_FIXTURE_TRUST -eq 'add') { $store.Add($certificate) }
      else { $store.Remove($certificate) }
    } finally { $store.Dispose(); $certificate.Dispose() }`;
  await exec('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, YOMIKURA_FIXTURE_CA: ca, YOMIKURA_FIXTURE_TRUST: operation },
    windowsHide: true, timeout: 15000,
  });
}

async function installCandidate() {
  const directory = path.join(process.env.RUNNER_TEMP, 'yomikura-clean-installer');
  const installers = (await readdir(directory)).filter((name) => name.endsWith('-setup.exe'));
  assert.equal(installers.length, 1);
  const installer = path.join(directory, installers[0]);
  report.installerSha256 = sha256(await readFile(installer));
  const command = String.raw`
    $ErrorActionPreference = 'Stop'
    $installed = Start-Process -FilePath $env:YOMIKURA_TEST_INSTALLER -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
    if ($installed.ExitCode) { throw 'Candidate installation failed' }
    $entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object DisplayName -eq 'Yomikura' | Select-Object -First 1
    if (!$entry) { throw 'Missing installation record' }
    ($entry.DisplayIcon -replace ',\d+$', '').Trim([char]34)`;
  const { stdout } = await exec('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, YOMIKURA_TEST_INSTALLER: installer }, windowsHide: true, timeout: 120000,
  });
  const executable = stdout.trim();
  assert.ok(path.isAbsolute(executable));
  return executable;
}

async function launchCandidate(executable) {
  app = spawn(executable, [], { cwd: output, windowsHide: true, stdio: 'ignore' });
  webview = await waitForFixture('the installed Windows WebView', () => chromium.connectOverCDP('http://127.0.0.1:9237', { timeout: 1500 }));
  const window = await waitForFixture('the Yomikura window', () =>
    webview.contexts().flatMap((context) => context.pages()).find((page) => /^https?:\/\/tauri\.localhost/.test(page.url())));
  window.setDefaultTimeout(18000);
  return window;
}

async function closeCandidate() {
  const command = String.raw`
    $ErrorActionPreference = 'Stop'
    $candidate = Get-Process -Id $env:YOMIKURA_FIXTURE_APP_PID
    if (!$candidate.CloseMainWindow() -or !$candidate.WaitForExit(15000)) { throw 'The installed app did not exit normally' }`;
  await exec('pwsh', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, YOMIKURA_FIXTURE_APP_PID: String(app.pid) },
    windowsHide: true, timeout: 18000,
  });
  await webview.close().catch(() => {});
}

async function libraryOperation(page, origin, query, variables = {}) {
  return page.evaluate(async ({ url, query, variables }) => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    return response.ok && !result.errors?.length ? result.data : null;
  }, { url: origin + '/api/graphql', query, variables });
}

async function libraryRequest(page, origin) {
  const data = await libraryOperation(page, origin, '{ categories(first:10) { nodes { id } } }');
  return Array.isArray(data?.categories?.nodes);
}

function passwords() {
  const label = page.getByLabel('Server password', { exact: true });
  const disclosure = page.locator('details').filter({ has: page.getByText('Sign in with Basic Auth', { exact: true }) });
  return { label, disclosure };
}

async function showSignIn() {
  const { label, disclosure } = passwords();
  if (!await label.isVisible()) await disclosure.locator('summary').click();
  await expect(label).toBeVisible();
}

async function signIn(secret) {
  await showSignIn();
  await page.getByLabel('Server username', { exact: true }).fill(username);
  await page.getByLabel('Server password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in to Suwayomi', exact: true }).click();
}

async function checkConnectionFailure() {
  await page.getByRole('button', { name: 'Test Connection', exact: true }).click();
  await expect(page.getByText('Connection Failed', { exact: true })).toBeVisible({ timeout: 15000 });
}

async function cachedPageHashes(chapterId) {
  return page.evaluate(async (id) => {
    const read = (request) => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await read(indexedDB.open('yomikura-offline'));
    let chapter;
    try {
      const chapters = await read(db.transaction('chapters', 'readonly').objectStore('chapters').getAll());
      chapter = chapters.find((item) => item.id === id);
    } finally { db.close(); }
    if (!chapter) return null;
    const cache = await caches.open('yomikura-page-cache');
    const hashes = await Promise.all(chapter.cachedUrls.map(async (url) => {
      const response = await cache.match(url);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }));
    return { library: chapter.serverBaseUrl, hashes };
  }, chapterId);
}

async function verifyAuthenticatedReading(browserControl, origin, originalHashes) {
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Add books', exact: true }).click();
  await page.getByRole('link', { name: 'Browse Local source', exact: true }).click();
  const book = page.getByRole('link', { name: title, exact: true });
  await book.click({ timeout: 30000 });
  const cover = page.getByRole('img', { name: title, exact: true }).first();
  await expect(cover).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => cover.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In Library', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Resume', exact: true }).first().click();
  const chapterId = Number(new URL(page.url()).pathname.split('/').at(-1));
  assert.ok(Number.isSafeInteger(chapterId) && chapterId > 0);
  await page.getByRole('button', { name: 'Go to page 3', exact: true }).click();
  const pageThree = page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 3', exact: true });
  await expect(pageThree).toHaveCSS('opacity', '1');
  const readingHash = await pageThree.evaluate(async (image) => {
    const response = await fetch(image.src);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
  assert.equal(readingHash, originalHashes[2], 'The installed reader must show the original protected page');
  await waitForFixture('progress acknowledged by the protected library', async () => {
    const data = await libraryOperation(browserControl, origin, 'query($id:Int!){chapter(id:$id){lastPageRead}}', { id: chapterId });
    return data?.chapter?.lastPageRead === 2;
  }, 20000);
  await page.getByRole('link', { name: 'Back to manga details', exact: true }).click();
  await page.getByRole('button', { name: /^Save .* for offline reading$/ }).click();
  await expect(page.getByRole('button', { name: /^Remove offline download of / })).toBeVisible({ timeout: 60000 });
  assert.deepEqual(await cachedPageHashes(chapterId), { library: origin, hashes: originalHashes });
  return chapterId;
}

try {
  await mkdir(path.join(library, 'webUI'), { recursive: true });
  await writeFile(path.join(library, 'webUI', 'index.html'), '<!doctype html><html lang="en"><head><title>Authentication fixture</title></head><body></body></html>');
  const chapter = path.join(library, 'local', title, 'Chapter 1');
  await mkdir(chapter, { recursive: true });
  await copyFile('public/demo/paper-garden.webp', path.join(chapter, '..', 'cover.webp'));
  const originalHashes = [];
  for (const [index, source] of originalPages.entries()) {
    const file = `public/demo/${source}.webp`;
    await copyFile(file, path.join(chapter, `00${index + 1}.webp`));
    originalHashes.push(sha256(await readFile(file)));
  }
  const jar = await downloadSuwayomi(output);
  async function boot(authMode) {
    backend = startSuwayomi(jar, {
      rootDir: library, port: upstream.port, authMode, authUsername: username,
      authPassword: password, webUIFlavor: 'CUSTOM',
    });
    await waitForFixture(`Suwayomi in ${authMode} mode`, async () => {
      const response = await fetch(upstream, { redirect: 'manual', signal: AbortSignal.timeout(1500) });
      if (authMode === 'BASIC_AUTH') return response.status === 401;
      if (authMode === 'SIMPLE_LOGIN') return response.status === 303 && response.headers.get('location')?.includes('login');
      return response.ok;
    }, 120000);
  }
  await boot('NONE');
  console.log('The HTTPS control server is ready.');
  const cert = await makeFixtureCertificate(output, 'localhost');
  await updateFixtureTrust(cert.ca, 'add');
  trustedCa = cert.ca;
  console.log('Windows trusts the disposable HTTPS certificate.');
  proxy = await startFixtureProxy(cert, upstream);
  const origin = `https://localhost:${proxy.address().port}`;
  const executable = await installCandidate();
  page = await launchCandidate(executable);
  const desktopOrigin = new URL(page.url()).origin;
  await page.getByText('Connect an existing library', { exact: true }).click();
  await page.getByLabel('Library address', { exact: true }).fill(origin);
  await page.getByRole('button', { name: 'Connect & Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  assert.ok(await libraryRequest(page, origin), 'The same certificate and CORS policy must allow a library request when authentication is off');
  report.cases.httpsControl = 'PASS';
  console.log('The installed app connected to the HTTPS control.');
  await page.goto(desktopOrigin + '/settings/connection');
  await expect(page.getByText('Connected Successfully', { exact: true })).toBeVisible();

  edge = await chromium.launch({ channel: 'msedge' });
  for (const mode of ['SIMPLE_LOGIN', 'BASIC_AUTH']) {
    await stopSuwayomi(backend);
    await boot(mode);
    console.log(`The server is ready with ${mode}.`);
    const web = await edge.newPage(mode === 'BASIC_AUTH' ? { httpCredentials: { username, password, origin } } : {});
    web.setDefaultTimeout(18000);
    try {
      await web.goto(origin);
      if (mode === 'SIMPLE_LOGIN') {
        await web.locator('form input[name="user"]').fill(username);
        await web.locator('form input[name="pass"]').fill(password);
        await web.locator('form button[type="submit"]').click();
        await web.waitForURL(origin + '/');
      }
      assert.ok(await libraryRequest(web, origin), `A browser must authenticate successfully with ${mode}`);
      await checkConnectionFailure();
      if (mode === 'SIMPLE_LOGIN') {
        report.cases.SIMPLE_LOGIN = { browserSignIn: 'PASS', desktopSignIn: 'UNSUPPORTED' };
        continue;
      }

      const basic = report.cases.BASIC_AUTH = { browserSignIn: 'PASS' };
      await signIn(password + '-wrong');
      await expect(passwords().disclosure.getByRole('alert')).toBeVisible();
      await expect(page.getByText('Connected Successfully', { exact: true })).toHaveCount(0);
      basic.wrongPassword = 'REJECTED';
      await signIn(password);
      await expect(page.getByText('Connected Successfully', { exact: true })).toBeVisible({ timeout: 15000 });
      basic.desktopSignIn = 'PASS';
      const chapterId = await verifyAuthenticatedReading(web, origin, originalHashes);
      basic.reading = { protectedCover: true, originalPage: true, serverProgress: true, downloadedPages: originalHashes.length };

      await page.getByRole('link', { name: 'Settings', exact: true }).click();
      await page.getByRole('button', { name: 'Connection', exact: true }).click();
      const primaryProfile = await page.evaluate(() => {
        const { activeProfileId, profiles } = JSON.parse(localStorage.getItem('yomikura-settings')).state;
        return profiles.find((profile) => profile.id === activeProfileId).name;
      });
      let alternateRequests = 0, sentAuthorization = false;
      alternateProxy = await startFixtureProxy(cert, upstream, (incoming) => {
        if (!incoming.url?.startsWith('/api/')) return;
        alternateRequests++;
        sentAuthorization ||= Boolean(incoming.headers.authorization);
      });
      const alternateAddress = `https://localhost:${alternateProxy.address().port}`;
      await page.getByRole('button', { name: 'Add Server Profile', exact: true }).click();
      await page.getByLabel('Profile Name', { exact: true }).fill('Second protected server');
      await page.getByLabel('Server URL', { exact: true }).fill(alternateAddress);
      await page.getByRole('button', { name: 'Save Profile', exact: true }).click();
      await checkConnectionFailure();
      assert.ok(alternateRequests > 0 && !sentAuthorization, 'The second server must receive a connection attempt without the first server credentials');
      const firstProfileButtons = page.getByRole('button', { name: `Delete ${primaryProfile} profile`, exact: true }).locator('..');
      await firstProfileButtons.getByRole('button', { name: 'Switch Server', exact: true }).click();
      await checkConnectionFailure();
      basic.profileIsolation = 'PASS';
      await signIn(password);
      await expect(page.getByText('Connected Successfully', { exact: true })).toBeVisible({ timeout: 15000 });
      const storedPassword = await page.evaluate((secret) => Object.values(localStorage).some((entry) => entry.includes(secret)), password);
      assert.equal(storedPassword, false, 'The server password must stay out of browser storage');
      await closeCandidate();
      page = await launchCandidate(executable);
      await page.goto(desktopOrigin + '/settings/connection');
      await checkConnectionFailure();
      await showSignIn();
      await expect(passwords().label).toHaveValue('');
      assert.deepEqual(await cachedPageHashes(chapterId), { library: origin, hashes: originalHashes });
      basic.relaunch = { promptsAgain: true, originalSavedPagesRetained: true };
    } finally { await web.context().close(); }
  }
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = String(error).replaceAll(password, '[fixture password]');
  if (page && !page.isClosed()) report.appView = (await page.locator('body').innerText({ timeout: 2500 }).catch(() => '')).replaceAll(password, '[fixture password]').slice(0, 1000);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (app?.exitCode === null && app.signalCode === null) app.kill();
  await webview?.close().catch(() => {});
  await edge?.close();
  await stopFixtureServer(alternateProxy);
  await stopFixtureServer(proxy);
  await stopSuwayomi(backend);
  if (trustedCa) await updateFixtureTrust(trustedCa, 'remove');
}
