import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
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
const upstream = new URL('http://127.0.0.1:4599');
const report = { commit: process.env.YOMIKURA_TESTED_COMMIT, verificationCommit: process.env.GITHUB_SHA, cases: {} };
let backend, proxy, edge, webview, app, thumbprint;

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
  app = spawn(executable, [], { cwd: output, windowsHide: true, stdio: 'ignore' });
  webview = await waitForFixture('the installed Windows WebView', () => chromium.connectOverCDP('http://127.0.0.1:9237', { timeout: 1500 }));
  return waitForFixture('the Yomikura window', () =>
    webview.contexts().flatMap((context) => context.pages()).find((page) => /^https?:\/\/tauri\.localhost/.test(page.url())));
}

async function libraryRequest(page, origin) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ categories(first:10) { nodes { id } } }' }),
    });
    const result = await response.json();
    return response.ok && !result.errors?.length && Array.isArray(result.data?.categories?.nodes);
  }, origin + '/api/graphql');
}

try {
  const pages = path.join(library, 'local', 'Remote Reading Fixture', 'Chapter 1');
  await mkdir(pages, { recursive: true });
  await copyFile('public/demo/paper-garden-page.webp', path.join(pages, '001.webp'));
  await mkdir(path.join(library, 'webUI'));
  await writeFile(path.join(library, 'webUI', 'index.html'), '<!doctype html><html lang="en"><head><title>Authentication fixture</title></head><body></body></html>');
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
  const cert = await makeFixtureCertificate(output, 'localhost');
  const fingerprint = new X509Certificate(await readFile(cert.ca)).fingerprint.replaceAll(':', '');
  await exec('certutil.exe', ['-user', '-f', '-addstore', 'Root', cert.ca], { windowsHide: true });
  thumbprint = fingerprint;
  proxy = await startFixtureProxy(cert, upstream);
  const origin = `https://localhost:${proxy.address().port}`;
  const page = await installCandidate();
  const desktopOrigin = new URL(page.url()).origin;
  await page.getByText('Connect an existing library', { exact: true }).click();
  await page.getByLabel('Library address', { exact: true }).fill(origin);
  await page.getByRole('button', { name: 'Connect & Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add books', exact: true }).click();
  await page.getByRole('link', { name: 'Browse Local source', exact: true }).click();
  await page.getByRole('link', { name: 'Remote Reading Fixture', exact: true }).click();
  await page.getByRole('link', { name: 'Resume', exact: true }).first().click();
  await expect(page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 1', exact: true })).toHaveCSS('opacity', '1');
  report.cases.httpsControl = 'PASS';
  await page.goto(desktopOrigin + '/settings/connection');
  await expect(page.getByText('Connected Successfully', { exact: true })).toBeVisible();

  edge = await chromium.launch({ channel: 'msedge' });
  for (const mode of ['SIMPLE_LOGIN', 'BASIC_AUTH']) {
    await stopSuwayomi(backend);
    await boot(mode);
    const web = await edge.newPage(mode === 'BASIC_AUTH' ? { httpCredentials: { username, password, origin } } : {});
    try {
      await web.goto(origin);
      if (mode === 'SIMPLE_LOGIN') {
        await web.locator('form input[name="user"]').fill(username);
        await web.locator('form input[name="pass"]').fill(password);
        await web.locator('form button[type="submit"]').click();
        await web.waitForURL(origin + '/');
      }
      assert.ok(await libraryRequest(web, origin), `A browser must authenticate successfully with ${mode}`);
    } finally { await web.context().close(); }

    await page.getByRole('button', { name: 'Test Connection', exact: true }).click();
    const failed = page.getByText('Connection Failed', { exact: true });
    const connected = page.getByText('Connected Successfully', { exact: true });
    await expect(failed.or(connected)).toBeVisible({ timeout: 15000 });
    if (await failed.isVisible()) {
      report.cases[mode] = {
        browserSignIn: 'PASS', desktopSignIn: 'FAIL',
        message: (await failed.locator('..').innerText()).replaceAll(password, '[fixture password]'),
        appPasswordFields: await page.locator('input[type="password"]').count(),
      };
    } else {
      assert.ok(await libraryRequest(page, origin), 'The desktop connection must include access to an authenticated library operation');
      report.cases[mode] = { browserSignIn: 'PASS', desktopSignIn: 'PASS' };
    }
  }
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = String(error).replaceAll(password, '[fixture password]');
  process.exitCode = 1;
} finally {
  await edge?.close();
  await webview?.close().catch(() => {});
  if (app?.exitCode === null && app.signalCode === null) app.kill();
  await stopFixtureServer(proxy);
  await stopSuwayomi(backend);
  if (thumbprint) await exec('certutil.exe', ['-user', '-delstore', 'Root', thumbprint], { windowsHide: true });
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
