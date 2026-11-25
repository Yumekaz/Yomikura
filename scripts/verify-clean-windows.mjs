import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { installStagedUpdate, startStagingFeed } from './fixtures/staging-updater.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.ok(process.env.RUNNER_TEMP && process.env.SystemRoot && process.env.LOCALAPPDATA && process.env.APPDATA);
const exec = promisify(execFile);
const root = path.resolve('.cache/clean-windows');
await mkdir(root, { recursive: true });
const data = path.join(process.env.LOCALAPPDATA, 'app.yomikura');
const serverData = path.join(data, 'server-data');
const report = { commit: process.env.GITHUB_SHA, checks: [] };
const bootstrap = process.env.YOMIKURA_STAGING_INSTALLER;
const candidate = process.env.YOMIKURA_CANDIDATE_INSTALLER;
if (bootstrap) assert.ok(candidate && path.isAbsolute(bootstrap) && path.isAbsolute(candidate));
const env = { ...process.env };
for (const name of Object.keys(env)) if (/^(?:path|java_home|jdk_home|jre_home|java_tool_options|_java_options)$/i.test(name)) delete env[name];
env.PATH = [path.join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(';');
let app, browser, page, executable, feed;

async function ps(script, variables = {}) {
  return (await exec('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...variables }, windowsHide: true, timeout: 120000,
  })).stdout.trim();
}

async function waitFor(description, work, duration = 60000) {
  const deadline = Date.now() + duration;
  let last;
  do {
    try { const value = await work(); if (value) return value; } catch (error) { last = error; }
    await delay(300);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`, { cause: last });
}

async function launch() {
  app = spawn(executable, [], { cwd: root, env, stdio: 'ignore', windowsHide: true });
  let failed;
  app.once('error', (error) => { failed = error; });
  await attach(() => {
    if (failed || app.exitCode !== null) throw failed ?? new Error(`Yomikura exited with ${app.exitCode}`);
  });
}

async function attach(check = () => {}) {
  browser = await waitFor('installed app WebView', () => {
    check();
    return chromium.connectOverCDP('http://127.0.0.1:9237', { timeout: 3000 });
  });
  page = await waitFor('Yomikura window', () => browser.contexts().flatMap((context) => context.pages()).find((entry) => /^https?:\/\/tauri\.localhost/.test(entry.url())));
}

async function currentServer() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('yomikura-settings') ?? '{}').state?.serverBaseUrl);
}

async function graphql(origin, document, variables) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(`${origin}/api/graphql`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document, variables }), signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.data && !body.errors, JSON.stringify(body.errors));
  return body.data;
}

async function closeWindow(pid = app.pid) {
  await browser.close().catch(() => {});
  await ps(String.raw`$p=Get-Process -Id $env:YOMIKURA_PID; if (!$p.CloseMainWindow()) { throw 'The app window could not be closed' }; if (!$p.WaitForExit(15000)) { throw 'The app did not exit' }`, { YOMIKURA_PID: String(pid) });
  await waitFor('backend shutdown recorded', async () => !(await stat(path.join(data, 'backend.pid')).catch(() => null)));
}

const pidFile = path.join(data, 'backend.pid');
const backendPid = async () => Number(await readFile(pidFile, 'utf8'));
const isRunning = (pid) => ps(`if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { 'yes' }`).then((value) => value === 'yes');

try {
  assert.ok(!await stat(serverData).catch(() => null), 'A clean runner has no managed library');
  assert.ok(!await stat(path.join(process.env.APPDATA, 'app.yomikura', 'yomikura-settings.json')).catch(() => null), 'A clean runner has no Yomikura settings');
  await assert.rejects(exec('java', ['-version'], { cwd: root, env }), { code: 'ENOENT' });
  let installer = bootstrap;
  if (bootstrap) {
    report.candidateSha256 = createHash('sha256').update(await readFile(candidate)).digest('hex');
    feed = await startStagingFeed(candidate);
  } else {
    const directory = path.join(process.env.RUNNER_TEMP, 'yomikura-clean-installer');
    const installers = (await readdir(directory)).filter((name) => name.endsWith('-setup.exe'));
    assert.equal(installers.length, 1);
    installer = path.join(directory, installers[0]);
  }
  report.installerSha256 = createHash('sha256').update(await readFile(installer)).digest('hex');
  executable = await ps(String.raw`$ErrorActionPreference='Stop'; $p=Start-Process -FilePath $env:YOMIKURA_TEST_INSTALLER -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden; if ($p.ExitCode) { throw "Installer exited $($p.ExitCode)" }; $entry=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object DisplayName -eq 'Yomikura' | Select-Object -First 1; if (!$entry) { throw 'Missing installation record' }; ($entry.DisplayIcon -replace ',\d+$', '').Trim([char]34)`, { YOMIKURA_TEST_INSTALLER: installer });
  assert.ok(path.isAbsolute(executable));
  await launch();
  const desktopOrigin = new URL(page.url()).origin;
  const begin = Date.now();
  await page.getByRole('button', { name: 'Set up my library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 480000 });
  report.setupMs = Date.now() - begin;
  const origin = await currentServer();
  const { aboutServer } = await graphql(origin, '{ aboutServer { version } }');
  assert.equal(aboutServer.version.replace(/^v/, ''), '2.4.2373');
  const liveJava = await ps(String.raw`$id = [int](Get-Content -LiteralPath $env:YOMIKURA_PID_FILE); (Get-Process -Id $id).Path`, { YOMIKURA_PID_FILE: path.join(data, 'backend.pid') });
  const javaRelative = path.relative(path.join(serverData, 'jre-21.0.13.1'), liveJava);
  assert.ok(javaRelative && !path.isAbsolute(javaRelative) && !javaRelative.split(path.sep).includes('..'));
  assert.match((await exec(liveJava, ['-version'], { env })).stderr, /(?:java|openjdk) version "21\.0\.13\.1/);
  const jar = createHash('sha256');
  for await (const chunk of createReadStream(path.join(serverData, 'Suwayomi-Server-v2.4.2373.jar'))) jar.update(chunk);
  assert.equal(jar.digest('hex'), 'dd05d523cc785b7acf90c9feac0bc84c53d5fb3af5ab2a33653646e2076e5217');
  report.checks.push('The user-facing wizard downloaded and started the pinned Java and Suwayomi on a clean profile without Java in the app environment.');

  const chapter = path.join(serverData, 'local', 'First Reading', 'Chapter 1');
  await mkdir(chapter, { recursive: true });
  for (let i = 1; i <= 4; i++) await copyFile(`public/demo/${i % 2 ? 'paper-garden-page' : 'moonlit-courier-page'}.webp`, path.join(chapter, `00${i}.webp`));
  await page.getByRole('link', { name: 'Add books', exact: true }).click();
  await page.getByRole('link', { name: 'Browse Local source', exact: true }).click();
  await page.getByRole('link', { name: 'First Reading', exact: true }).click({ timeout: 45000 });
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  const bookPath = new URL(page.url()).pathname;
  const note = 'Keep this note through the Windows update.';
  if (feed) {
    await page.getByText('My notes', { exact: false }).click();
    await page.getByRole('textbox', { name: 'A note for First Reading', exact: true }).fill(note);
    await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
    await page.getByRole('button', { name: /^Save .* for offline reading$/ }).click();
    await expect(page.getByRole('button', { name: /^Remove offline download of / })).toBeVisible({ timeout: 60000 });
  }
  await page.getByRole('link', { name: 'Resume', exact: true }).first().click();
  await page.getByRole('button', { name: 'Go to page 3', exact: true }).click();
  const pageThree = () => page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 3', exact: true });
  await expect(pageThree()).toHaveCSS('opacity', '1');
  const readerPath = new URL(page.url()).pathname;
  const chapterId = Number(readerPath.split('/').at(-1));
  assert.ok(chapterId > 0);
  await waitFor('server saved page 3', async () => (await graphql(origin, 'query($id:Int!){chapter(id:$id){lastPageRead}}', { id: chapterId })).chapter.lastPageRead === 2);
  await delay(1500); // Exercise ordinary restart after the just-confirmed database write has settled.
  let updatedAppPid;
  if (feed) {
    assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')), '1.0.25');
    const before = createHash('sha256').update(await readFile(executable)).digest('hex');
    const initialPid = await backendPid();
    assert.ok(Number.isSafeInteger(initialPid) && initialPid > 0);
    const initialAppPid = app.pid;
    await installStagedUpdate(page, feed, async () => {
      assert.equal(createHash('sha256').update(await readFile(executable)).digest('hex'), before);
      assert.ok(await isRunning(initialPid), 'Failed signature verification must leave the owned library running.');
    });
    await waitFor('signed installer replaced the running release', async () => {
      return (await ps('(Get-Item -LiteralPath $env:YOMIKURA_EXE).VersionInfo.ProductVersion', { YOMIKURA_EXE: executable })).startsWith(feed.version);
    }, 180000);
    assert.equal(feed.payloadRequests(), 2);
    await browser.close().catch(() => {});
    await attach();
    assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')), feed.version);
    // Probe the original PID before accepting the new server. If it is left alive
    // it can hold the same database open while the new app tries to start.
    assert.ok(!await isRunning(initialPid), `The update left its previous managed Suwayomi process alive (PID ${initialPid}).`);
    const newPid = await ps(String.raw`$process=Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:YOMIKURA_EXE -and $_.ProcessId -ne [int]$env:YOMIKURA_OLD_PID } | Select-Object -First 1; $process.ProcessId`, { YOMIKURA_EXE: executable, YOMIKURA_OLD_PID: String(initialAppPid) });
    updatedAppPid = Number(newPid);
    assert.ok(updatedAppPid > 0);
    report.checks.push('The native updater rejected altered bytes and installed the signed candidate. The previous managed backend exited.');
  } else {
    await closeWindow();
    await launch();
  }
  await expect(page.getByRole('link', { name: 'First Reading', exact: true }).first()).toBeVisible({ timeout: 60000 });
  if (feed) {
    await page.goto(`${desktopOrigin}${bookPath}`);
    await page.getByText('My notes', { exact: false }).click();
    await expect(page.getByRole('textbox', { name: 'A note for First Reading', exact: true })).toHaveValue(note);
    await expect(page.getByRole('button', { name: /^Remove offline download of / })).toBeVisible();
  }
  await page.goto(`${desktopOrigin}${readerPath}`);
  await expect(page.getByText('3 of 4 pages', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(pageThree()).toHaveCSS('opacity', '1');
  assert.equal((await graphql(await currentServer(), 'query($id:Int!){chapter(id:$id){lastPageRead}}', { id: chapterId })).chapter.lastPageRead, 2);
  report.checks.push('The installed app added the original-art book, read page 3, and resumed there after the app and managed server restarted.');
  await page.screenshot({ path: path.join(root, 'resume.png') });
  await closeWindow(updatedAppPid);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.failure = String(error.stack ?? error);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(root, 'failed.png') }).catch(() => {});
    await writeFile(path.join(root, 'failed-view.txt'), await page.locator('body').innerText().catch(() => '')).catch(() => {});
  }
  await copyFile(path.join(serverData, 'suwayomi.log'), path.join(root, 'suwayomi.log')).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (app?.exitCode === null) app.kill();
  feed?.server.closeAllConnections();
  feed?.server.close();
  console.log(JSON.stringify(report));
  await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
}
