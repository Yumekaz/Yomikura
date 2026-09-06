# Release readiness

This checklist describes what must be true before publishing a Yomikura release. It is focused on reliability and user trust rather than new product features.

## Required checks

```bash
pnpm run verify:release
pnpm run test:e2e
```

The release verification command runs TypeScript checks, unit tests, a production build, and a bundle-size budget check. CI additionally runs the production dependency audit and the Windows installer lifecycle test.
Tag-triggered publishing repeats the release verification and browser interaction suite, and rejects tags that do not match the synchronized application version.

## Installed-app checks

On a clean Windows runner, the verification workflow must prove:

1. The NSIS installer exists and is a realistic size.
2. Installation registers Yomikura correctly.
3. A seeded user-selected storage folder, using the same pinned and SHA-256-verified Suwayomi build plus Java 21, lets the installed app start its local engine and answer a real GraphQL health request.
4. The installed executable and its owned backend remain alive through the launch smoke window, then close cleanly.
5. Uninstallation removes the application executable.
6. The user-selected storage folder outside the install directory survives uninstall.

The test does not delete arbitrary user folders. It uses a temporary runner folder and an explicit sentinel file.
The lifecycle gate pre-stages its runtime so a slow third-party download cannot be mistaken for an installer or startup regression. Clean-machine first-run downloads remain part of the manual beta matrix below.

## Manual beta matrix

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
- Mark artifacts as unsigned until platform signing and notarization are configured.
- Keep the version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` synchronized.

## Current boundary

Windows and macOS platform trust still depend on external signing credentials. A successful CI build proves compilation and packaging, not SmartScreen or Gatekeeper trust.
