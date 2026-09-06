import { readFile } from "node:fs/promises";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) throw new Error("A release tag is required, for example v1.0.13");

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const expected = `v${packageJson.version}`;
if (tag !== expected) {
  throw new Error(`Release tag ${tag} does not match package version ${expected}`);
}

console.log(`Release tag ${tag} matches package version ${packageJson.version}`);
