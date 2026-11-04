import { readFile, readdir, realpath, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Collect the license texts from the actual installed runtime dependency graph.
// No registry request, package execution or personal filesystem inventory occurs.
export async function generateLicenseNotices(source, destination) {
  const root = path.resolve(source);
  const seen = new Set(), notices = [], missing = [];
  async function locate(name, from) {
    for (let folder = from; ; folder = path.dirname(folder)) {
      const candidate = path.join(folder, "node_modules", name);
      try { return await realpath(candidate); } catch {}
      if (path.dirname(folder) === folder) return null;
    }
  }
  async function visit(name, from, required) {
    const folder = await locate(name, from);
    if (!folder) { if (required) throw new Error(`Runtime dependency is not installed: ${name}`); return; }
    if (seen.has(folder)) return; seen.add(folder);
    const pkg = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
    const files = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice|ofl)([._-]|$)/i.test(entry.name));
    const texts = [];
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) texts.push(`--- ${file.name} ---\n${await readFile(path.join(folder, file.name), "utf8")}`);
    if (!texts.length && pkg.name === "react-remove-scroll-bar" && pkg.version === "2.3.8" && pkg.license === "MIT") {
      // This npm archive omits LICENSE. Keep the reviewed upstream text pinned
      // in the repository; do not fetch or invent a license during a build.
      texts.push(await readFile(new URL("../public/licenses/react-remove-scroll-bar-MIT.txt", import.meta.url), "utf8"));
    }
    if (!texts.length) missing.push(`${pkg.name}@${pkg.version}`);
    notices.push({ name: `${pkg.name}@${pkg.version}`, text: `${pkg.name}@${pkg.version}\nDeclared license: ${typeof pkg.license === "string" ? pkg.license : "See package license"}\n\n${texts.join("\n\n")}` });
    for (const dependency of Object.keys(pkg.dependencies || {})) await visit(dependency, folder, !pkg.optionalDependencies?.[dependency]);
    for (const dependency of Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies })) await visit(dependency, folder, false);
  }
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const name of Object.keys(pkg.dependencies || {})) await visit(name, root, true);
  if (missing.length) throw new Error(`License text missing from installed runtime packages: ${missing.join(", ")}`);
  const text = "Third-party JavaScript, UI and font license notices\n\nThese notices describe the installed runtime packages used for this build. Each package retains its own copyright and license. Native/Rust and separately downloaded components have additional notices; see THIRD_PARTY_NOTICES.md.\n\n" + notices.sort((a, b) => a.name.localeCompare(b.name)).map((notice) => notice.text).join("\n\n" + "=".repeat(72) + "\n\n") + "\n";
  await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, text);
  console.log(`Included license texts for ${notices.length} runtime packages.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateLicenseNotices(process.cwd(), path.resolve("public/licenses/THIRD_PARTY_NPM.txt"));
}
