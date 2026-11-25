import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import path from 'node:path';
import { expect } from '@playwright/test';

export async function startStagingFeed(installer) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_OS, 'Windows');
  const tls = path.join(process.env.RUNNER_TEMP, 'yomikura-test-feed');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const [payload, signature, key, cert] = await Promise.all([
    readFile(installer), readFile(installer + '.sig', 'utf8'),
    readFile(path.join(tls, 'server.key')), readFile(path.join(tls, 'server.crt')),
  ]);
  assert.ok(signature.trim(), 'The exact candidate must have a Tauri updater signature');
  const bad = Buffer.from(payload);
  bad[bad.length - 1] ^= 1;
  let altered = true, payloadRequests = 0;
  const server = createServer({ key, cert }, (request, response) => {
    if (request.url === '/latest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ version, platforms: { 'windows-x86_64': { url: 'https://127.0.0.1:9238/candidate-setup.exe', signature: signature.trim() } } }));
    }
    if (request.url === '/candidate-setup.exe') {
      payloadRequests++;
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': payload.length });
      return response.end(altered ? bad : payload);
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(9238, '127.0.0.1', resolve); });
  return { server, version, serveSignedBytes: () => { altered = false; }, payloadRequests: () => payloadRequests };
}

export async function installStagedUpdate(page, feed, unchanged) {
  await page.goto('http://tauri.localhost/settings/about');
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click();
  await expect(page.getByText(`Update Available: v${feed.version}`, { exact: true })).toBeVisible({ timeout: 45000 });
  const install = page.getByRole('button', { name: 'Download & Relaunch Update', exact: true });
  await install.click();
  await expect(page.getByRole('alert').filter({ hasText: /unverified file|could not be verified/i })).toBeVisible({ timeout: 45000 });
  assert.equal(feed.payloadRequests(), 1);
  await unchanged();
  feed.serveSignedBytes();
  await install.click();
}
