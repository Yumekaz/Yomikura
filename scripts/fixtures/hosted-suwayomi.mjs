import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:https';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const version = '2.4.2373';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function downloadSuwayomi(output) {
  const name = `Suwayomi-Server-v${version}.jar`;
  const jar = path.join(output, name);
  await mkdir(output, { recursive: true });
  const response = await fetch(`https://github.com/Suwayomi/Suwayomi-Server/releases/download/v${version}/${name}`, { signal: AbortSignal.timeout(180000) });
  assert.ok(response.ok && response.body, 'The pinned Suwayomi release is unavailable');
  await pipeline(Readable.fromWeb(response.body), createWriteStream(jar));
  assert.equal(sha256(await readFile(jar)), 'dd05d523cc785b7acf90c9feac0bc84c53d5fb3af5ab2a33653646e2076e5217', 'Suwayomi release checksum differs');
  return jar;
}

export function startSuwayomi(jar, { rootDir, port, ...config }, extra = []) {
  const settings = { rootDir, port, ip: '127.0.0.1', webUIEnabled: true, initialOpenInBrowserEnabled: false, kcefEnabled: false, ...config };
  const properties = Object.entries(settings).map(([key, value]) => `-Dsuwayomi.tachidesk.config.server.${key}=${value}`);
  return spawn('java', ['-Xmx512m', '-XX:ActiveProcessorCount=2', ...extra, ...properties, '-jar', jar], { stdio: 'ignore', windowsHide: true });
}

export async function stopSuwayomi(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, 'exit');
  child.kill('SIGTERM');
  if (!await Promise.race([stopped.then(() => true), delay(8000, false, { ref: false })])) {
    child.kill('SIGKILL');
    await stopped;
  }
}

export async function waitForFixture(description, check, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    try { const value = await check(); if (value) return value; }
    catch (error) { lastError = error; }
    await delay(350);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}`, { cause: lastError });
}

export async function makeFixtureCertificate(output, hostname) {
  const windows = process.platform === 'win32';
  const gitOpenSSL = path.join(process.env.ProgramFiles ?? '', 'Git', 'usr', 'bin', 'openssl.exe');
  const openssl = windows && existsSync(gitOpenSSL) ? gitOpenSSL : 'openssl';
  const key = path.join(output, 'server.key'), cert = path.join(output, 'server.crt');
  const ca = path.join(output, 'ca.crt'), caKey = path.join(output, 'ca.key');
  const csr = path.join(output, 'server.csr'), extensions = path.join(output, 'tls-ext.cnf');
  await exec(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=Yomikura test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-keyout', caKey, '-out', ca], { windowsHide: true });
  await exec(openssl, ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', `/CN=${hostname}`, '-keyout', key, '-out', csr], { windowsHide: true });
  await writeFile(extensions, `subjectAltName=DNS:${hostname}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
  await exec(openssl, ['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey,
    '-CAcreateserial', '-days', '1', '-extfile', extensions, '-out', cert], { windowsHide: true });
  return { ca, key: await readFile(key), cert: await readFile(cert) };
}

export async function startFixtureProxy(certificate, upstream, observe = () => {}) {
  const server = createServer({ key: certificate.key, cert: certificate.cert }, (incoming, outgoing) => {
    const forwarded = request(upstream, {
      path: incoming.url, method: incoming.method,
      headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
    }, (response) => {
      observe(incoming, response);
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(502).end();
    });
    outgoing.on('close', () => forwarded.destroy());
    incoming.pipe(forwarded);
  });
  server.listen(0, upstream.hostname);
  await once(server, 'listening');
  return server;
}

export async function stopFixtureServer(server) {
  if (!server?.listening) return;
  const closed = once(server, 'close');
  server.close();
  server.closeAllConnections();
  await closed;
}
