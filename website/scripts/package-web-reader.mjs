import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const python = process.platform === 'win32' ? 'python' : 'python3';

async function fetchReleaseAsset(asset) {
  const response = await fetch(asset.url);
  assert.ok(response.ok, `Could not download ${asset.name}: HTTP ${response.status}`);
  const contents = Buffer.from(await response.arrayBuffer());
  assert.equal(contents.length, asset.bytes, `Unexpected size for ${asset.name}`);
  assert.equal(createHash('sha256').update(contents).digest('hex'), asset.sha256, `Checksum mismatch for ${asset.name}`);
  return contents;
}

export async function copyReleasedWebReader({ webPackage, webRoot, destination, reader }) {
  const { zip, checksum } = webPackage;
  const [archive, checksumFile] = await Promise.all([fetchReleaseAsset(zip), fetchReleaseAsset(checksum)]);
  assert.equal(checksumFile.toString('utf8').trim(), `${zip.sha256}  ${zip.name}`, 'Published checksum must identify the exact web ZIP');
  await writeFile(destination, archive);
  await writeFile(destination + '.sha256', checksumFile);
  await run(python, ['-m', 'zipfile', '-e', destination, webRoot]);
  const source = JSON.parse(await readFile(path.join(webRoot, 'source.json'), 'utf8'));
  assert.equal(source.repository, 'https://github.com/Yumekaz/Yomikura');
  assert.equal(source.commit, reader.commit, 'Published web ZIP must come from the selected release commit');
  return { sha256: zip.sha256, bytes: zip.bytes };
}

export async function packageWebReader({ source, webRoot, destination, version, reader }) {
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(path.join(source, file), path.join(webRoot, file));
  await stat(path.join(webRoot, 'licenses', 'THIRD_PARTY_NPM.txt'));
  await writeFile(path.join(webRoot, 'source.json'), JSON.stringify({ repository: 'https://github.com/Yumekaz/Yomikura', ...reader }, null, 2) + '\n');
  const index = await readFile(path.join(webRoot, 'index.html'), 'utf8');
  const supportsSubpath = index.includes('<base href="/"');
  const subpathGuide = supportsSubpath ? 'For a Suwayomi subpath, set server.webUISubpath in its configuration, restart, then include that path in the library address. For example, use https://your-server.example/yomikura if the path is /yomikura.\n\n' : '';
  const staticSubpathGuide = supportsSubpath ? ' For a subpath, set the base element in index.html to that path with a trailing slash and serve the app and its assets there.' : '';
  await writeFile(path.join(webRoot, 'README-Yomikura.txt'), `Yomikura web ${version}\n\nThis is the built browser interface; no Git clone or frontend compilation is required.\n\nFollow the illustrated guide: https://yumekaz.github.io/Yomikura/setup/\n\nSuwayomi CUSTOM WebUI: stop your server, preserve any existing custom WebUI, and extract this archive's CONTENTS directly into the webUI folder inside Suwayomi's data directory. index.html and assets must sit directly in that folder, not in another nested folder. Choose CUSTOM as the WebUI flavor and restart Suwayomi. Your usual local Suwayomi address now opens Yomikura. Keep the server running while reading. Do not move or delete your database, downloads or other library data.\n\n${subpathGuide}For a separate static HTTP server, enable index.html fallback for application routes.${staticSubpathGuide}\n\nYour books and sources are managed by Suwayomi. No third-party sources or comic content are included.\n`);
  await run(python, ['-m', 'zipfile', '-c', destination, ...await readdir(webRoot)], { cwd: webRoot, maxBuffer: 1024 * 1024 });
  const zip = await readFile(destination);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  await writeFile(destination + '.sha256', `${sha256}  ${path.basename(destination)}\n`);
  return { sha256, bytes: zip.length };
}
