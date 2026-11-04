import assert from "node:assert/strict";

export const REQUIRED_RELEASE_BUILDS = [
  "Release preflight", "Release installer smoke (Windows)",
  "publish-tauri (macos-latest)", "publish-tauri (ubuntu-22.04)", "publish-tauri (windows-latest)",
];

/** Recheck existing draft bytes only against the run that actually built them. */
export function inspectReleaseOrigin(run, release, jobs, tag, repository) {
  assert.match(tag, /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/, "Provide a release version tag");
  assert.equal(release.draft, true, "Artifact verification may update only an unpublished draft");
  assert.equal(release.tag_name, tag, "Draft tag differs from the requested release");
  assert.equal(run.event, "push", "The source must be a tag-triggered build run");
  assert.equal(run.path?.split("@")[0], ".github/workflows/publish.yml", "The source must be the release build workflow");
  assert.equal(run.head_repository?.full_name?.toLowerCase(), repository.toLowerCase(), "The build must belong to this repository");
  assert.match(run.head_sha ?? "", /^[a-f0-9]{40}$/, "Missing source build commit");
  assert.equal(release.target_commitish, run.head_sha, "Draft assets and source run must use the same commit");
  for (const name of REQUIRED_RELEASE_BUILDS) assert.ok(jobs.some((job) => job.name === name && job.conclusion === "success"), `The source build gate did not pass: ${name}`);
  return run.head_sha;
}
