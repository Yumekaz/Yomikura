import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:https';
import { homedir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { chromium, expect } from '@playwright/test';

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
const version = '2.4.2373';
const jarName = `Suwayomi-Server-v${version}.jar`;
const checks = { commit: sourceCommit, environment: 'Disposable Ubuntu runner and Chromium', passed: [] };
let server, proxy, browser, database, importedCertificate = false;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function trustFixtureCertificate() {
  const key = path.join(output, 'server.key'), cert = path.join(output, 'server.crt');
  const ca = path.join(output, 'ca.crt'), caKey = path.join(output, 'ca.key');
  const csr = path.join(output, 'server.csr'), extensions = path.join(output, 'tls-ext.cnf');
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=Yomikura test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', caKey, '-out', ca]);
  await exec('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes',
    '-subj', `/CN=${hostname}`, '-keyout', key, '-out', csr]);
  await writeFile(extensions, `subjectAltName=DNS:${hostname}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
  await exec('openssl', ['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey,
    '-CAcreateserial', '-days', '1', '-extfile', extensions, '-out', cert]);

  // Chromium prefers the legacy database if it exists. Initialize it only on this runner.
  const nss = path.join(homedir(), '.pki', 'nssdb');
  database = `sql:${nss}`;
  await mkdir(nss, { recursive: true });
  if (!await stat(path.join(nss, 'cert9.db')).catch(() => false)) await exec('certutil', ['-N', '-d', database, '--empty-password']);
  await exec('certutil', ['-A', '-d', database, '-n', certificateName, '-t', 'C,,', '-i', ca]);
  importedCertificate = true;
  return { key: await readFile(key), cert: await readFile(cert) };
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

  const pages = path.join(library, 'local', 'Hosted Reading Fixture', 'Chapter 1');
  await mkdir(pages, { recursive: true });
  await copyFile('public/demo/moonlit-courier-page.webp', path.join(pages, '001.webp'));
  await copyFile('public/demo/paper-garden-page.webp', path.join(pages, '002.webp'));
  await copyFile('public/demo/moonlit-courier.webp', path.join(pages, '..', 'cover.webp'));
  const jar = path.join(output, jarName);
  const jarResponse = await fetch(`https://github.com/Suwayomi/Suwayomi-Server/releases/download/v${version}/${jarName}`, { signal: AbortSignal.timeout(180000) });
  assert.ok(jarResponse.ok && jarResponse.body, 'The pinned Suwayomi release is unavailable');
  await pipeline(Readable.fromWeb(jarResponse.body), createWriteStream(jar));
  assert.equal(sha256(await readFile(jar)), 'dd05d523cc785b7acf90c9feac0bc84c53d5fb3af5ab2a33653646e2076e5217', 'Suwayomi release checksum differs');
  server = spawn('java', ['-Xmx512m', '-XX:ActiveProcessorCount=2', ...Object.entries({
    rootDir: library, port: upstream.port, ip: upstream.hostname, webUIEnabled: true,
    webUIFlavor: 'CUSTOM', initialOpenInBrowserEnabled: false, kcefEnabled: false,
    authMode: 'SIMPLE_LOGIN', authUsername: username, authPassword: password,
  }).map(([key, value]) => `-Dsuwayomi.tachidesk.config.server.${key}=${value}`), '-jar', jar], { stdio: 'ignore' });
  let ready = false;
  const deadline = Date.now() + 120000;
  do {
    assert.equal(server.exitCode, null, 'Suwayomi exited during setup');
    const response = await fetch(new URL('/login.html', upstream), { signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (response?.ok && (await response.text()).includes('name="pass"')) { ready = true; break; }
    await delay(400);
  } while (Date.now() < deadline);
  assert.ok(ready, 'Suwayomi’s normal sign-in page did not become ready');

  proxy = createServer(await trustFixtureCertificate(), (incoming, outgoing) => {
    const upstreamRequest = request(upstream, {
      path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
    }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstreamRequest.on('error', () => outgoing.destroy());
    outgoing.on('close', () => upstreamRequest.destroy());
    incoming.pipe(upstreamRequest);
  });
  proxy.listen(0, upstream.hostname);
  await once(proxy, 'listening');
  const origin = `https://${hostname}:${proxy.address().port}`;
  browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${hostname} ${upstream.hostname}`] });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(origin + '/setup');
  await expect(page.locator('form input[name="user"]')).toBeVisible();
  await page.locator('form input[name="user"]').fill(username);
  await page.locator('form input[name="pass"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Your browser. Your reading room.' })).toBeVisible();
  assert.ok(await page.evaluate(() => location.protocol === 'https:' && isSecureContext));
  checks.passed.push('Chromium trusted the HTTPS endpoint and reached the extracted ZIP through Suwayomi’s normal login');

  await page.getByLabel('Your Suwayomi address', { exact: true }).fill(origin);
  await page.getByRole('button', { name: 'Connect my library', exact: true }).click();
  await expect(page.getByText('Your library is connected. Next, choose your sources below.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await page.getByRole('link', { name: 'Add books', exact: true }).click();
  await page.getByRole('link', { name: 'Browse Local source', exact: true }).click();
  await page.getByRole('link', { name: 'Hosted Reading Fixture', exact: true }).click();
  await page.getByRole('button', { name: 'Add to Library', exact: true }).click();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In Library', exact: true })).toBeVisible();
  checks.passed.push('The authenticated session allowed source browsing and adding a book');

  const bookmark = new URL(page.url()).pathname;
  await page.getByRole('link', { name: 'Resume', exact: true }).first().click();
  await expect(page.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 1', exact: true })).toHaveCSS('opacity', '1');
  checks.passed.push('The reader loaded a real authenticated page image');

  await page.goto(origin + bookmark);
  const enqueue = expectOperation(page, 'EnqueueChapterDownload');
  await page.getByRole('button', { name: /^Download .* through Suwayomi$/ }).click();
  assert.ok((await enqueue).enqueueChapterDownload?.downloadStatus, 'The download action was not acknowledged');
  const queue = expectOperation(page, 'GetDownloadStatus');
  await page.getByRole('link', { name: 'Downloads', exact: true }).click();
  assert.ok(Array.isArray((await queue).downloadStatus?.queue), 'The authenticated queue could not be read');
  await expect(page.getByRole('heading', { name: 'Downloads', exact: true })).toBeVisible();
  checks.passed.push('Yomikura submitted the download request and read the queue using the authenticated session');
  checks.result = 'PASS';
} catch (error) {
  checks.result = 'FAIL';
  checks.failure = String(error).replaceAll(password, '[fixture password]');
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (proxy?.listening) {
    const closed = once(proxy, 'close');
    proxy.close();
    proxy.closeAllConnections();
    await closed;
  }
  if (server?.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    if (!await Promise.race([stopped.then(() => true), delay(8000).then(() => false)])) {
      server.kill('SIGKILL');
      await stopped;
    }
  }
  if (importedCertificate) await exec('certutil', ['-D', '-d', database, '-n', certificateName]);
  await writeFile(path.join(output, 'result.json'), JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
}
