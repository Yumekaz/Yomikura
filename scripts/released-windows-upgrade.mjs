import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

// Official installers share a Windows application identity. Never run this
// harness on a personal workstation, even if a caller supplies another path.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.ok(process.env.RUNNER_TEMP && process.env.JAVA_HOME);
const from = process.env.FROM_RELEASE;
assert.ok(['v1.0.24', 'v1.0.25-beta.5'].includes(from));
const target = 'v1.0.25', run = promisify(execFile);
const root = path.resolve('.cache/released-upgrade', from); await mkdir(root, { recursive: true });
const report = { from, target, checks: [], failures: [], boundaries: ['fresh GitHub Windows runner', 'official unmodified installers', 'synthetic Local source and original artwork', 'no third-party tracker authentication', 'WebView automation, not physical input'] };
const backend = 'http://127.0.0.1:4596';
let browser, page, backendProcess, appProcess;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function ps(script, env = {}) {
  const result = await run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 1024 * 1024 });
  return result.stdout.trim();
}
async function github(route) {
  const response = await fetch('https://api.github.com/repos/Yumekaz/Yomikura/' + route, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}` } });
  assert.equal(response.status, 200); return response.json();
}
async function graphql(query, variables = {}) {
  const response = await fetch(backend + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(5000) });
  const result = await response.json(); assert.ok(response.ok && result.data && !result.errors, JSON.stringify(result.errors)); return result.data;
}
async function until(work, milliseconds = 120000) {
  const deadline = Date.now() + milliseconds; let last;
  while (Date.now() < deadline) { try { const result = await work(); if (result) return result; } catch (error) { last = error; } await delay(500); }
  throw last || new Error('Timed out waiting for installed app');
}
async function attach() {
  browser = await until(() => chromium.connectOverCDP('http://127.0.0.1:9237', { timeout: 3000 }));
  page = await until(() => browser.contexts().flatMap((context) => context.pages()).find((candidate) => /^https?:\/\/tauri\.localhost/.test(candidate.url())));
  await page.waitForLoadState('domcontentloaded'); return page;
}
async function records() {
  return page.evaluate(async () => {
    const result = {};
    for (const name of ['yomikura-offline', 'yomikura-notes']) {
      if (!(await indexedDB.databases()).some((db) => db.name === name)) { result[name] = {}; continue; }
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      result[name] = {};
      for (const store of db.objectStoreNames) result[name][store] = await new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close();
    }
    return result;
  });
}
try {
  const old = await github('releases/tags/' + from), current = await github('releases/latest');
  assert.equal(old.draft, false); assert.equal(current.tag_name, target); assert.equal(current.prerelease, false);
  const installer = old.assets.find((asset) => asset.name.endsWith('_x64-setup.exe')); assert.ok(installer);
  assert.match(installer.digest, /^sha256:[a-f0-9]{64}$/);
  assert.ok(installer.browser_download_url.startsWith(`https://github.com/Yumekaz/Yomikura/releases/download/${from}/`));
  const response = await fetch(installer.browser_download_url); assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(hash(bytes), installer.digest.slice(7));
  const installerPath = path.join(root, 'old-setup.exe'); await writeFile(installerPath, bytes);
  await writeFile(path.join(root, 'releases.json'), JSON.stringify({ old: { tag: from, digest: installer.digest, bytes: bytes.length }, target: { tag: target, commit: current.target_commitish } }, null, 2));
  const jarPath = path.join(process.env.RUNNER_TEMP, 'yomikura-reliability-deps/Suwayomi-Server-v2.3.2243.jar'); await mkdir(path.dirname(jarPath), { recursive: true });
  const jarDigest = '821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5';
  let jar = await readFile(jarPath).catch(() => null);
  if (!jar || hash(jar) !== jarDigest) { const response = await fetch('https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.3.2243/Suwayomi-Server-v2.3.2243.jar'); assert.ok(response.ok); jar = Buffer.from(await response.arrayBuffer()); assert.equal(hash(jar), jarDigest); await writeFile(jarPath, jar); }
  const library = path.join(root, 'library');
  for (const name of ['Chapter 1', 'Chapter 2']) {
    const folder = path.join(library, 'local/Upgrade Story', name); await mkdir(folder, { recursive: true });
    for (let i = 1; i <= 3; i++) await copyFile(path.resolve(`public/demo/${i % 2 ? 'moonlit-courier-page' : 'paper-garden-page'}.webp`), path.join(folder, `00${i}.webp`));
  }
  const backendLog = createWriteStream(path.join(root, 'backend.log'));
  backendProcess = spawn(path.join(process.env.JAVA_HOME, 'bin/java.exe'), ['-Xmx512m', '-XX:ActiveProcessorCount=2', `-Dsuwayomi.tachidesk.config.server.rootDir=${library}`, '-Dsuwayomi.tachidesk.config.server.port=4596', '-Dsuwayomi.tachidesk.config.server.ip=127.0.0.1', '-Dsuwayomi.tachidesk.config.server.initialOpenInBrowserEnabled=false', '-Dsuwayomi.tachidesk.config.server.webUIEnabled=false', '-Dsuwayomi.tachidesk.config.server.kcefEnabled=false', '-jar', jarPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  backendProcess.stdout.pipe(backendLog); backendProcess.stderr.pipe(backendLog);
  await until(async () => (await graphql('{ __typename }')).__typename);
  const catalog = await graphql('mutation { fetchSourceManga(input:{source:"0",type:POPULAR,page:1}) { mangas { id title } } }');
  const book = catalog.fetchSourceManga.mangas.find((book) => book.title === 'Upgrade Story'); assert.ok(book);
  const details = await graphql('mutation($id:Int!){fetchMangaAndChapters(input:{id:$id,fetchManga:true,fetchChapters:true}){chapters{id name sourceOrder}}}', { id: book.id });
  const chapter = details.fetchMangaAndChapters.chapters.find((chapter) => /1/.test(chapter.name)); assert.ok(chapter);
  await graphql('mutation($id:Int!){updateManga(input:{id:$id,patch:{inLibrary:true}}){manga{id}}}', { id: book.id });
  await graphql('mutation($id:Int!){updateChapter(input:{id:$id,patch:{isRead:false,lastPageRead:1,isBookmarked:true}}){chapter{id}}}', { id: chapter.id });
  const configDirectory = path.join(process.env.APPDATA, 'app.yomikura'); await mkdir(configDirectory, { recursive: true });
  assert.equal(await readFile(path.join(configDirectory, 'yomikura-settings.json')).then(() => true, () => false), false, 'CI profile must start empty');
  await writeFile(path.join(configDirectory, 'yomikura-settings.json'), JSON.stringify({ version: 0, state: { serverBaseUrl: backend, serverDataPath: '', mockMode: false, connectionStatus: 'connected', profiles: [{ id: 'upgrade-test', name: 'Upgrade test library', url: backend }], activeProfileId: 'upgrade-test', themeMode: 'light', readerMode: 'LTR', reducedMotion: true, backupIntervalHours: 0, autoDeleteReadChapters: false, autoDownloadCount: 0 } }));
  const installed = await ps(String.raw`$ErrorActionPreference="Stop"; $p=Start-Process -FilePath $env:UPGRADE_INSTALLER -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru; if($p.ExitCode -ne 0){throw "Install failed"}; $e=Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" | Where-Object {$_.DisplayName -eq "Yomikura"} | Select-Object -First 1; if(-not $e){throw "No installation record"}; ($e.DisplayIcon -replace ',\d+$', '').Trim([char]34)`, { UPGRADE_INSTALLER: installerPath, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9237 --remote-debugging-address=127.0.0.1" });
  assert.ok(path.isAbsolute(installed));
  const appLog = createWriteStream(path.join(root, 'app.log'));
  await writeFile(path.join(root, 'installed.json'), JSON.stringify({ path: installed, productVersion: await ps('(Get-Item -LiteralPath $env:UPGRADE_APP).VersionInfo.ProductVersion', { UPGRADE_APP: installed }) }));
  appProcess = spawn(installed, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9237 --remote-debugging-address=127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  appProcess.stdout.pipe(appLog); appProcess.stderr.pipe(appLog);
  await attach();
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 60000 });
  await page.goto(`http://tauri.localhost/manga/${book.id}`);
  await expect(page.getByRole('heading', { name: 'Upgrade Story', exact: true })).toBeVisible({ timeout: 30000 });
  const download = page.getByRole('button', { name: `Download ${chapter.name} for offline reading`, exact: true });
  if (await download.count()) await download.click();
  else await page.getByRole('button', { name: new RegExp(`^(Download|Save).*${chapter.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click();
  await until(async () => (await records())['yomikura-offline'].chapters?.some((item) => item.id === chapter.id), 120000);
  const before = await records(); await writeFile(path.join(root, 'before.json'), JSON.stringify(before, null, 2));
  if (from === 'v1.0.25-beta.5') {
    await page.getByText('My notes', { exact: true }).click();
    await page.getByLabel('A note for Upgrade Story', { exact: true }).fill('Keep this unsynced upgrade-test note.');
    await expect(page.getByText('Saved on this device. Sync to keep it with your library.', { exact: true })).toBeVisible();
  }
  const cachedDigests = () => page.evaluate(async () => {
    const cache = await caches.open('yomikura-page-cache'), result = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request), bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
      result.push([request.url, bytes.byteLength, digest]);
    }
    return result.sort((a, b) => a[0].localeCompare(b[0]));
  });
  const savedBytes = await cachedDigests(); assert.ok(savedBytes.length >= 3, 'A saved record without page bytes is not a successful download');
  const settingsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('yomikura-settings') || 'null'));
  report.checks.push('Official old installer digest verified, real Local library loaded and chapter saved through UI');
  await page.screenshot({ path: path.join(root, 'before-upgrade.png') });
  // This invokes the released UI's real updater; no new installer is manually
  // substituted and no HTTP or Tauri updater response is mocked.
  await page.evaluate(() => window.dispatchEvent(new Event('yomikura-check-updates')));
  const notice = page.getByRole('status').filter({ hasText: /v1\.0\.25.*available/ });
  await expect(notice).toBeVisible({ timeout: 60000 });
  await notice.getByRole('button', { name: 'Update', exact: true }).click();
  await until(async () => {
    const output = await ps('(Get-Item -LiteralPath $env:UPGRADE_APP).VersionInfo.ProductVersion', { UPGRADE_APP: installed });
    return output.startsWith('1.0.25') && !output.includes('beta');
  }, 300000);
  await attach(); await page.goto('http://tauri.localhost/library');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('link', { name: 'Upgrade Story', exact: true }).first()).toBeVisible();
  const after = await records(); await writeFile(path.join(root, 'after.json'), JSON.stringify(after, null, 2));
  assert.ok(after['yomikura-offline'].chapters?.some((item) => item.id === chapter.id), 'Saved chapter record was lost during upgrade');
  assert.deepEqual(await cachedDigests(), savedBytes, 'Saved page bytes changed or disappeared during upgrade');
  const settingsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('yomikura-settings') || 'null'));
  assert.equal(settingsAfter.state.serverBaseUrl, backend); assert.equal(settingsAfter.state.themeMode, settingsBefore?.state.themeMode || 'light');
  const progress = await graphql('query($id:Int!){chapter(id:$id){isRead lastPageRead isBookmarked}}', { id: chapter.id });
  assert.deepEqual(progress.chapter, { isRead: false, lastPageRead: 1, isBookmarked: true });
  report.checks.push('Real updater installed target release and relaunched; library membership, partial progress, bookmark, saved record, server profile and theme survived');
  if (from === 'v1.0.25-beta.5') {
    await page.goto(`http://tauri.localhost/manga/${book.id}`);
    await page.getByText('My notes', { exact: true }).click();
    await expect(page.getByLabel('A note for Upgrade Story', { exact: true })).toHaveValue('Keep this unsynced upgrade-test note.');
    report.checks.push('Unsynced note saved through the beta.5 UI survived the real update');
  }
  report.checks.push('Every saved page retained its original SHA-256 and byte length');
  await page.screenshot({ path: path.join(root, 'after-upgrade.png') });
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.failures.push(String(error));
  await writeFile(path.join(root, 'process-diagnostics.txt'), await ps('Get-CimInstance Win32_Process | Where-Object {$_.Name -match "Yomikura|msedgewebview"} | Select-Object ProcessId,Name,ExecutablePath,CommandLine | Format-List | Out-String').catch(String));
  await writeFile(path.join(root, 'window-diagnostics.txt'), await ps('Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id,ProcessName,MainWindowTitle | Format-Table | Out-String').catch(String));
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {}); await writeFile(path.join(root, 'failure-dom.txt'), await page.locator('body').innerText().catch(() => 'unavailable')); }
  process.exitCode = 1;
} finally {
  await writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
  // Only this harness's own process handles are stopped; runner-only teardown.
  if (appProcess && appProcess.exitCode === null) appProcess.kill();
  if (backendProcess && backendProcess.exitCode === null) backendProcess.kill();
  console.log(JSON.stringify(report));
}
