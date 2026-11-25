import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { packageWebReader } from '../website/scripts/package-web-reader.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
const source = process.cwd(), root = path.resolve('.cache/candidate-web');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir(root, { recursive: true });
const archive = path.join(root, `Yomikura-web-${version}.zip`);
const digest = await packageWebReader({ source, webRoot: path.resolve('dist'), destination: archive, version, reader: { commit: process.env.GITHUB_SHA } });
const webRoot = path.join(root, 'extracted');
await promisify(execFile)('python3', ['-m', 'zipfile', '-e', archive, webRoot]);
await stat(path.join(webRoot, 'index.html'));
await writeFile(path.join(root, 'build.json'), JSON.stringify({ source, webRoot, version, commit: process.env.GITHUB_SHA, ...digest }, null, 2));
