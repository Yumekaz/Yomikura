import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const python = process.platform === 'win32' ? 'python' : 'python3';

export async function packageWebReader({ source, webRoot, destination, version, reader }) {
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(path.join(source, file), path.join(webRoot, file));
  await stat(path.join(webRoot, 'licenses', 'THIRD_PARTY_NPM.txt'));
  await writeFile(path.join(webRoot, 'source.json'), JSON.stringify({ repository: 'https://github.com/Yumekaz/Yomikura', ...reader }, null, 2) + '\n');
  await writeFile(path.join(webRoot, 'README-Yomikura.txt'), `Yomikura web ${version}\n\nThis is the built browser interface; no Git clone or frontend compilation is required.\n\nFollow the illustrated guide: https://yumekaz.github.io/Yomikura/setup/\n\nSuwayomi CUSTOM WebUI: stop your server, preserve any existing custom WebUI, and extract this archive's CONTENTS directly into the webUI folder inside Suwayomi's data directory. index.html and assets must sit directly in that folder, not in another nested folder. Choose CUSTOM as the WebUI flavor and restart Suwayomi. Your usual local Suwayomi address now opens Yomikura. Keep the server running while reading. Do not move or delete your database, downloads or other library data.\n\nFor another static HTTP server, enable index.html fallback for application routes. Opening index.html directly as a file is not supported.\n\nYour books and sources are managed by Suwayomi. No third-party sources or comic content are included.\n`);
  await run(python, ['-m', 'zipfile', '-c', destination, ...await readdir(webRoot)], { cwd: webRoot, maxBuffer: 1024 * 1024 });
  const zip = await readFile(destination);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  await writeFile(destination + '.sha256', `${sha256}  ${path.basename(destination)}\n`);
  return { sha256, bytes: zip.length };
}
