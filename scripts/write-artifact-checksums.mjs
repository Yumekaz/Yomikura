import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const [root = "src-tauri/target/release/bundle", output = "SHA256SUMS.txt"] = process.argv.slice(2);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  const artifactPattern = /\.(appimage|deb|dmg|exe|msi|rpm|tar\.gz|zip)$/i;
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (artifactPattern.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const files = await collect(path.resolve(root));
if (!files.length) throw new Error(`No release artifacts found under ${root}`);

const lines = [];
for (const file of files.sort()) {
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  lines.push(`${hash}  ${path.relative(path.resolve(root), file).replaceAll("\\", "/")}`);
}

await writeFile(output, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${lines.length} SHA-256 entries to ${output}`);
