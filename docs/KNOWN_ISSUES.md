# Known issues

## Unsigned installers

Windows installers are not Authenticode-signed and macOS packages are not notarized while project signing applications and credentials are pending. SmartScreen or Gatekeeper can therefore display an unknown-publisher warning. Verify release checksums and download only from the official repository.

## First launch requires external downloads

Local desktop mode downloads pinned Java 21 and Suwayomi components from their official GitHub releases. Blocked GitHub access, low disk space, or an interrupted connection can stop setup. On Windows, managed TLS roots are used for the local engine; a failed connection can still be caused by a network policy that blocks GitHub entirely. Retry after correcting the network or storage problem; do not delete an existing library folder as a first response.

## Third-party sources can break independently

Yomikura does not control extension repositories or source websites. A source may fail because its site changed, rate-limited the server, rejected its certificate, or enabled anti-bot protection. Try another source and preserve the exact diagnostic message when reporting a repeated failure.

The local engine disables Suwayomi's optional KCEF browser provider so first launch does not silently download a separate Chromium runtime. Sources that require an interactive embedded browser challenge are therefore not supported in local-engine mode.

Managed Yomikura storage also disables Suwayomi's fallback browser auto-open. Existing storage receives this setting the next time Yomikura starts its local engine.

## Platform coverage

Windows receives the automated install, local-engine readiness, shutdown, uninstall, and storage-preservation test. macOS and Linux are compiled and packaged in CI, but their installed packages do not yet receive the same native lifecycle automation.

## Local-source Date search sorting in Suwayomi v2.3.2243

This server version advertises a Date choice in Local-source search but applies title sorting regardless of that choice. Title ascending/descending works. Yomikura detects the affected source/version and marks Date unavailable instead of sending a known-ignored selection. Other sources retain their supplied sort choices. The backend behavior and the exact shipped bytecode were verified; see [catalog filter evidence](RELIABILITY_BATCH_7_2026-10-24.md).

## Local reliability verification

The [current reliability handoff](RELIABILITY_STATUS_2026-10-24.md) tracks the original audit findings and the evidence for each implemented batch. New download/profile isolation is covered by frontend tests with simulated native IPC and real Chrome storage; an installed native WebView run of that workflow remains outstanding. Signed-in tracker-provider behavior and fully disconnected PWA deep-link loading also remain unverified. Earlier native backup/export checks are documented separately and do not certify every later frontend change.
