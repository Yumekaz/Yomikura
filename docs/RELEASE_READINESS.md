# Release readiness

This checklist describes what must be true before publishing a Yomikura release. It is focused on reliability and user trust rather than new product features.

## Required checks

```bash
pnpm run verify:release
pnpm run test:e2e
```

The release verification command runs TypeScript checks, unit tests, a production build, and a bundle-size budget check. CI additionally runs the production dependency audit and the Windows installer lifecycle test.
Tag-triggered builds repeat the release verification and browser interaction suite, and reject tags that do not match the synchronized application version. They create a draft release for review. Publish that draft only after all release jobs succeed, the notes reflect actual platform coverage, and the installed candidate has been checked.

Pushes to `codex/reading-room` also run Verify and upload the Windows installer as the `yomikura-windows-installer` workflow artifact after the installer smoke test. This test build does not create a GitHub release. Verify can also be manually dispatched against the branch. Artifacts expire after seven days.

## Installed-app checks

On a clean Windows runner, the verification workflow must prove:

1. The NSIS installer exists and is a realistic size.
2. Installation registers Yomikura correctly.
3. A seeded user-selected storage folder, using the same pinned and SHA-256-verified Suwayomi build plus Java 21, lets the installed app start its local engine and answer a real GraphQL health request.
4. The installed executable and its owned backend remain alive through the launch smoke window, then close cleanly.
5. Uninstallation removes the application executable.
6. The user-selected storage folder outside the install directory survives uninstall.
7. Local-engine startup stays under three minutes and the combined application/backend working set stays below 1.5 GB on the clean runner.

The test does not delete arbitrary user folders. It uses a temporary runner folder and an explicit sentinel file.
The lifecycle gate pre-stages its runtime so a slow third-party download cannot be mistaken for an installer or startup regression. Clean-machine first-run downloads remain part of the manual beta matrix below.
The runner independently downloads the production-pinned Windows Java archive, verifies its SHA-256, and starts that private launcher with system Java removed from its child environment. The installed-app smoke test then uses that verified private runtime. Native Rust unit tests also run on Windows. This covers the archive and runtime launch; it does not claim a fully automated first-run wizard or interrupted component-download interaction.

## Manual beta matrix

For public testers, use the reproducible journey and privacy guidance in [BETA_TESTING.md](BETA_TESTING.md). Treat reports of unexpected data changes as release-blocking until reproduced or disproved.

Before a public release, manually check the installed app through these paths:

- First launch with no Java available.
- First launch with an existing Java runtime.
- Server unavailable, then server restored.
- Invalid server URL and a valid server URL.
- Extension repository that is empty, unreachable, or returns a certificate error.
- Search, open a title, read pages, close, reopen, and resume.
- Download, cancel, restart, and remove a saved chapter.
- Update over an existing installation while preserving the selected data folder.
- Close the window and confirm the Yomikura and owned backend processes exit.
- Uninstall while preserving the user-selected storage folder.

Record the result and the exact user-facing recovery message. A passing build is not proof that these flows work.

## Release evidence

- Keep the commit SHA and workflow run URL with the release notes.
- Verify that every release has the expected installer assets before announcing it.
- The publish workflow creates a SHA-256 checksum file for each platform and attaches it to the GitHub release.
- Checksum entries use the flat filenames downloaded from GitHub. The final job downloads the attached assets and verifies every checksum before review.
- The scanner includes final packager outputs, not nested staging contents. Recovery from older manifests excludes only the two known Debian intermediates (`control.tar.gz` and `data.tar.gz`), refuses to treat those files as release downloads, and still requires all actual packages and signatures.
- Architecture suffixes added to updater archives are reconciled by their original build digest. Missing, changed or ambiguous uploaded files fail verification; hashes are not regenerated from unverified uploads.
- A failed final artifact job can be resumed with the publish workflow's manual verification mode. It accepts an existing draft tag and original build run, verifies matching source commits and all build gates, then uses that run's original checksum artifacts. It does not rebuild the app or publish the draft. Published releases cannot use this recovery mode.
- The final job checks updater versions and repository/tag URLs, compares embedded and attached signatures, and verifies the payload signatures against the configured public key with Minisign. See the [Tauri updater contract](https://v2.tauri.app/plugin/updater/) and [Minisign verification instructions](https://jedisct1.github.io/minisign/).
- The security workflow runs CodeQL, dependency review, secret scanning, and produces an SPDX JSON SBOM artifact. Dependabot tracks npm, Cargo, and workflow-action updates.
- Mark artifacts as unsigned until platform signing and notarization are configured.
- Keep the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` synchronized.

## Current boundary

Windows and macOS platform trust still depend on external signing credentials. A successful CI build proves compilation and packaging, not SmartScreen or Gatekeeper trust.

The configured updater endpoint follows GitHub's latest stable release. Draft and beta releases do not replace that stable channel. Beta testers should download the newer beta installer manually; an “up to date” result describes the stable channel. Forward automatic installation still requires a newer published stable version to exercise the production endpoint end to end.
