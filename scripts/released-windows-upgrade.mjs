import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { installStagedUpdate, startStagingFeed } from './fixtures/staging-updater.mjs';

// Official installers share a Windows application identity. Never run this
// harness on a personal workstation, even if a caller supplies another path.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_OS, 'Windows');
assert.ok(process.env.RUNNER_TEMP && process.env.JAVA_HOME);
const from = process.env.FROM_RELEASE;
const candidate = process.env.YOMIKURA_CANDIDATE_INSTALLER;
const stagingInstaller = process.env.YOMIKURA_STAGING_INSTALLER;
const stagingVersion = '1.0.25';
assert.ok(stagingInstaller ? Boolean(candidate && path.isAbsolute(candidate) && path.isAbsolute(stagingInstaller)) : candidate ? from === 'v1.0.25' && path.isAbsolute(candidate) : ['v1.0.24', 'v1.0.25-beta.5'].includes(from));
const target = candidate ? process.env.GITHUB_SHA : 'v1.0.25', run = promisify(execFile);
const testNotes = Boolean(stagingInstaller) || from !== 'v1.0.24';
const root = path.resolve('.cache/released-upgrade', stagingInstaller ? 'staging-feed' : from); await mkdir(root, { recursive: true });
const report = { from: stagingInstaller ? `${stagingVersion} staging client` : from, target, checks: [], failures: [], boundaries: ['fresh GitHub Windows runner', stagingInstaller ? 'local HTTPS feed with an unpublished bootstrap client and the exact production-signed candidate' : candidate ? 'manual in-place installation of the candidate artifact' : 'official unmodified installers and real updater', 'synthetic Local source and original artwork', 'no third-party tracker authentication', 'WebView automation, not physical input'] };
const backend = 'http://127.0.0.1:4596';
let browser, page, backendProcess, appProcess, stagingFeed;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function ps(script, env = {}) {
  const result = await run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ...env }, windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024 });
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
async function install(filename) {
  return ps(String.raw`$ErrorActionPreference="Stop"; $p=Start-Process -FilePath $env:UPGRADE_INSTALLER -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru; if($p.ExitCode -ne 0){throw "Install failed"}; $e=Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" | Where-Object {$_.DisplayName -eq "Yomikura"} | Select-Object -First 1; if(-not $e){throw "No installation record"}; ($e.DisplayIcon -replace ',\d+$', '').Trim([char]34)`, { UPGRADE_INSTALLER: filename });
}
async function records() {
  return page.evaluate(async () => {
    const result = {};
    for (const name of ['yomikura-offline', 'yomikura-book-notes']) {
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
  const current = candidate ? undefined : await github('releases/latest');
  let installerPath = stagingInstaller, oldArtifact;
  if (stagingInstaller) {
    oldArtifact = { version: stagingVersion, sha256: hash(await readFile(stagingInstaller)) };
    stagingFeed = await startStagingFeed(candidate);
  } else {
    const old = await github('releases/tags/' + from);
    assert.equal(old.draft, false);
    if (current) { assert.equal(current.tag_name, 'v1.0.25'); assert.equal(current.prerelease, false); }
    const installer = old.assets.find((asset) => asset.name.endsWith('_x64-setup.exe')); assert.ok(installer);
    assert.match(installer.digest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(installer.browser_download_url.startsWith(`https://github.com/Yumekaz/Yomikura/releases/download/${from}/`));
    const response = await fetch(installer.browser_download_url); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(hash(bytes), installer.digest.slice(7));
    installerPath = path.join(root, 'old-setup.exe'); await writeFile(installerPath, bytes);
    oldArtifact = { tag: from, digest: installer.digest, bytes: bytes.length };
  }
  const targetArtifact = candidate ? { commit: target, sha256: hash(await readFile(candidate)) } : { tag: target, commit: current.target_commitish };
  await writeFile(path.join(root, 'releases.json'), JSON.stringify({ old: oldArtifact, target: targetArtifact }, null, 2));
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
  const installed = await install(installerPath);
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
  // Loading a previously uninitialized Local chapter can set its page count.
  // Establish and record the partial-read baseline after that initialization,
  // so this upgrade check cannot misattribute an earlier change to migration.
  await graphql('mutation($id:Int!){updateChapter(input:{id:$id,patch:{isRead:false,lastPageRead:1,isBookmarked:true}}){chapter{id}}}', { id: chapter.id });
  const progressBefore = await graphql('query($id:Int!){chapter(id:$id){isRead lastPageRead isBookmarked}}', { id: chapter.id });
  assert.deepEqual(progressBefore.chapter, { isRead: false, lastPageRead: 1, isBookmarked: true });
  await writeFile(path.join(root, 'progress-before.json'), JSON.stringify(progressBefore));
  if (testNotes) {
    await page.locator('summary').filter({ hasText: 'My notes' }).click();
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
  await writeFile(path.join(root, 'download-verified.json'), JSON.stringify({ count: savedBytes.length, pages: savedBytes }, null, 2));
  const settingsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('yomikura-settings') || 'null'));
  report.checks.push(`${stagingFeed ? 'Staging installer' : 'Official old installer digest verified'}, real Local library loaded and chapter saved through UI`);
  await page.screenshot({ path: path.join(root, 'before-upgrade.png') });
  if (stagingFeed) {
    const beforeHash = hash(await readFile(installed));
    assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')), stagingVersion);
    await installStagedUpdate(page, stagingFeed, async () => assert.equal(hash(await readFile(installed)), beforeHash));
    await until(async () => {
      const output = await ps('(Get-Item -LiteralPath $env:UPGRADE_APP).VersionInfo.ProductVersion', { UPGRADE_APP: installed });
      return output.startsWith(stagingFeed.version);
    }, 300000);
    assert.equal(stagingFeed.payloadRequests(), 2);
    await browser?.close().catch(() => {});
    report.checks.push('The native updater rejected altered bytes without replacing the app, then downloaded and installed the signed candidate from the HTTPS test feed.');
  } else if (candidate) {
    const beforeHash = hash(await readFile(installed));
    await browser.close().catch(() => {});
    await ps(String.raw`$process = Get-Process -Id $env:UPGRADE_PID; if (!$process.CloseMainWindow()) { throw 'Could not close the released Yomikura window' }; if (!$process.WaitForExit(15000)) { throw 'The released app did not exit' }`, { UPGRADE_PID: String(appProcess.pid) });
    assert.equal(await install(candidate), installed, 'The candidate must replace the app in the same install directory');
    const afterHash = hash(await readFile(installed));
    assert.notEqual(afterHash, beforeHash, 'The candidate executable must replace the released executable');
    await writeFile(path.join(root, 'target-file-verified.json'), JSON.stringify({ beforeHash, afterHash }));
    appProcess = spawn(installed, [], { windowsHide: true, stdio: 'ignore' });
  } else {
    // The original release probe continues to drive the public updater.
    await page.evaluate(() => window.dispatchEvent(new Event('yomikura-check-updates')));
    const notice = page.getByRole('status').filter({ hasText: /v1\.0\.25.*available/ });
    await expect(notice).toBeVisible({ timeout: 60000 });
    await notice.getByRole('button', { name: 'Update', exact: true }).click();
    await writeFile(path.join(root, 'update-started.json'), JSON.stringify({ time: new Date().toISOString(), from, target }));
    await until(async () => {
      const failure = page.isClosed() ? '' : await page.getByRole('alert').allTextContents().catch(() => []);
      if (String(failure).includes('Update failed')) throw new Error(String(failure));
      const output = await ps('(Get-Item -LiteralPath $env:UPGRADE_APP).VersionInfo.ProductVersion', { UPGRADE_APP: installed });
      return output.startsWith('1.0.25') && !output.includes('beta');
    }, 300000);
    await writeFile(path.join(root, 'target-file-verified.json'), JSON.stringify({ productVersion: target }));
    await browser?.close().catch(() => {});
  }
  await attach(); await page.goto('http://tauri.localhost/library');
  if (stagingFeed) assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')), stagingFeed.version);
  if (candidate) {
    await page.goto('http://tauri.localhost/settings/backup');
    await expect(page.getByRole('button', { name: 'Export device recovery' })).toBeVisible();
    await page.goto('http://tauri.localhost/library');
  } else assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|version')), target.slice(1), 'The running process must be the new version, not merely its on-disk file');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('link', { name: 'Upgrade Story', exact: true }).first()).toBeVisible();
  const after = await records(); await writeFile(path.join(root, 'after.json'), JSON.stringify(after, null, 2));
  assert.ok(after['yomikura-offline'].chapters?.some((item) => item.id === chapter.id), 'Saved chapter record was lost during upgrade');
  assert.deepEqual(await cachedDigests(), savedBytes, 'Saved page bytes changed or disappeared during upgrade');
  const settingsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('yomikura-settings') || 'null'));
  assert.equal(settingsAfter.state.serverBaseUrl, backend); assert.equal(settingsAfter.state.themeMode, settingsBefore?.state.themeMode || 'light');
  const progress = await graphql('query($id:Int!){chapter(id:$id){isRead lastPageRead isBookmarked}}', { id: chapter.id });
  assert.deepEqual(progress.chapter, { isRead: false, lastPageRead: 1, isBookmarked: true });
  report.checks.push(`${candidate && !stagingFeed ? 'Candidate installed in place and launched' : 'Real updater installed target release and relaunched'}; library membership, partial progress, bookmark, saved record, server profile and theme survived`);
  if (testNotes) {
    await page.goto(`http://tauri.localhost/manga/${book.id}`);
    await page.locator('summary').filter({ hasText: 'My notes' }).click();
    await expect(page.getByLabel('A note for Upgrade Story', { exact: true })).toHaveValue('Keep this unsynced upgrade-test note.');
    report.checks.push('The unsynced note saved through the earlier installed UI survived the upgrade');
  }
  report.checks.push('Every saved page retained its original SHA-256 and byte length');
  await page.screenshot({ path: path.join(root, 'after-upgrade.png') });
  if (testNotes && !stagingFeed) {
    const started = Date.now(), samples = [];
    const chapters = details.fetchMangaAndChapters.chapters;
    let cycle = 0, decodedPageVisits = 0, chapterVisits = 0;
    while (candidate ? Date.now() - started < 10 * 60 * 1000 : cycle < 8) {
      for (const reading of chapters) {
        await page.goto(`http://tauri.localhost/reader/${reading.id}`);
        chapterVisits++;
        for (const number of [1, 2, 3]) {
          await page.getByRole('button', { name: `Go to page ${number}`, exact: true }).click();
          await expect(page.locator('[id^="reader-page-"]').getByRole('img', { name: `Page ${number}`, exact: true })).toHaveCSS('opacity', '1', { timeout: 30000 });
          decodedPageVisits++;
          if (candidate) await delay(4000);
        }
      }
      samples.push({ cycle, elapsedMs: Date.now() - started, heapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null) });
      cycle++;
    }
    report.readingStress = { durationMs: Date.now() - started, chapterVisits, decodedPageVisits, samples, interpretation: 'two original chapters repeated, with WebView heap observations' };
    await page.goto(`http://tauri.localhost/manga/${book.id}`);
    const second = chapters.find((item) => item.id !== chapter.id); assert.ok(second);
    const save = page.getByRole('button', { name: `Save ${second.name} for offline reading`, exact: true });
    if (candidate) {
      const retained = await cachedDigests();
      await page.evaluate((chapterOrder) => {
        const start = Cache.prototype.put;
        window.downloadInjection = { mode: 'pause', entered: false };
        Cache.prototype.put = async function (key, value) {
          const address = new URL(key instanceof Request ? key.url : key);
          if (address.pathname.includes(`/chapter/${chapterOrder}/page/`) && address.searchParams.has('__yomi_cache_attempt')) {
            const rehearsal = window.downloadInjection;
            rehearsal.entered = true;
            if (rehearsal.mode === 'pause') await new Promise((resolve) => { rehearsal.release = resolve; });
            if (rehearsal.mode === 'quota') throw new DOMException('Fixture cache is full', 'QuotaExceededError');
          }
          return start.call(this, key, value);
        };
        window.restoreDownloadStorage = () => { Cache.prototype.put = start; };
      }, second.sourceOrder);
      await save.click();
      await until(() => page.evaluate(() => window.downloadInjection.entered));
      await page.getByRole('button', { name: `Cancel download of ${second.name}`, exact: true }).click();
      await page.evaluate(() => window.downloadInjection.release());
      await expect(save).toBeVisible();
      await until(async () => JSON.stringify(await cachedDigests()) === JSON.stringify(retained));
      await page.evaluate(() => { window.downloadInjection.mode = 'quota'; });
      await save.click();
      const retry = page.getByRole('button', { name: `Retry download of ${second.name}`, exact: true });
      await expect(retry).toBeVisible();
      assert.ok(!(await records())['yomikura-offline'].chapters?.some((item) => item.id === second.id));
      await until(async () => JSON.stringify(await cachedDigests()) === JSON.stringify(retained));
      await page.evaluate(() => window.restoreDownloadStorage());
      await retry.click();
      report.checks.push('Cancelled an in-flight device save and simulated a full cache. The earlier download and its page checksums survived; the interrupted chapter could be retried.');
    } else await save.click();
    await until(async () => (await records())['yomikura-offline'].chapters?.some((item) => item.id === second.id));
    backendProcess.kill(); await until(async () => !await fetch(backend + '/api/graphql', { signal: AbortSignal.timeout(1000) }).then(() => true, () => false));
    await page.goto(`http://tauri.localhost/reader/${second.id}`);
    await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
    const offlineImage = page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 2', exact: true });
    await expect(offlineImage).toHaveAttribute('src', /^blob:/); await expect(offlineImage).toHaveCSS('opacity', '1');
    await until(() => page.evaluate(async (chapterId) => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('yomikura-progress'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      try { return await new Promise((resolve, reject) => { const request = db.transaction('heads').objectStore('heads').getAll(); request.onsuccess = () => resolve(request.result.some((head) => head.chapter.chapterId === chapterId && head.patch.lastPageRead === 1 && head.sequence > head.acknowledgedSequence)); request.onerror = () => reject(request.error); }); }
      finally { db.close(); }
    }, second.id));
    await page.screenshot({ path: path.join(root, 'saved-reading-server-unavailable.png') });
    const oldWebView = (await (await fetch('http://127.0.0.1:9237/json/version')).json()).webSocketDebuggerUrl;
    await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|restart')).catch(() => {});
    await browser?.close().catch(() => {});
    await until(async () => { const version = await (await fetch('http://127.0.0.1:9237/json/version', { signal: AbortSignal.timeout(1000) })).json(); return version.webSocketDebuggerUrl !== oldWebView; });
    await attach();
    await page.goto(`http://tauri.localhost/reader/${second.id}`);
    await expect(page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 2', exact: true })).toHaveAttribute('src', /^blob:/, { timeout: 30000 });
    const reconnectLog = createWriteStream(path.join(root, 'backend-reconnect.log'));
    backendProcess = spawn(backendProcess.spawnfile, backendProcess.spawnargs.slice(1), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    backendProcess.stdout.pipe(reconnectLog); backendProcess.stderr.pipe(reconnectLog);
    await until(async () => (await graphql('{ __typename }')).__typename);
    await page.goto('http://tauri.localhost/library');
    await until(async () => {
      const result = await graphql('query($id:Int!){chapter(id:$id){isRead lastPageRead}}', { id: second.id });
      return result.chapter.isRead && result.chapter.lastPageRead === 1;
    });
    report.checks.push(`${decodedPageVisits} decoded page visits across ${chapterVisits} chapter visits, saved-page reading and a fresh app restart during server unavailability, then replay to the real reconnected server with completion retained`);
  }
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
  stagingFeed?.server.closeAllConnections();
  stagingFeed?.server.close();
  // Only this harness's own process handles are stopped; runner-only teardown.
  if (appProcess && appProcess.exitCode === null) appProcess.kill();
  if (backendProcess && backendProcess.exitCode === null) backendProcess.kill();
  console.log(JSON.stringify(report));
}
