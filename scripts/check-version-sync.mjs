import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");

const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const appLockVersion = cargoLock.match(/name\s*=\s*"app"\s*\r?\nversion\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": packageJson.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/Cargo.lock": appLockVersion,
  "src-tauri/tauri.conf.json": tauriConfig.version,
};
const uniqueVersions = new Set(Object.values(versions));

console.log(Object.entries(versions).map(([file, version]) => `${file}: ${version ?? "missing"}`).join("\n"));
if (uniqueVersions.size !== 1 || uniqueVersions.has(undefined)) {
  console.error("Version mismatch: keep all release version files synchronized.");
  process.exit(1);
}
