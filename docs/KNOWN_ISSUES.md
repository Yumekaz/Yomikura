# Known issues

## Security review and existing installers

The November 2026 dependency review identified advisories in the `zip` crate used by published native versions, including v1.0.25-beta.5, and in build/development dependencies. An advisory's severity is not evidence of a working exploit against Yomikura; its export code also validates filenames and sizes. These controls do not establish that an affected dependency is safe.

v1.0.25 is the security-update release line; check its publication notes and verified packages before upgrading. Earlier installers, including beta.5, retain their original dependencies. Updating source never patches an already-downloaded binary. Avoid passing untrusted archives to affected native builds. Follow the [security policy](../SECURITY.md) and release notes for updates.

Linux GTK dependencies also include the upstream `glib` VariantStrIter advisory (GHSA-wrw7-89jp-8q8g). Its patched major version cannot be substituted for Tauri's GTK dependency without compatibility work; native Linux coverage remains limited. This is an open upstream/platform constraint, not a dismissed alert.

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

## Reusing a server address for a different library

Yomikura now verifies a client metadata marker, records backup origins, and tags new progress, notes and saved chapters with their library marker. Earlier or unverified data is retained for review rather than silently assigned. Backups with another marker cannot postpone a fresh scheduled backup. Earlier saved pages and notes remain available in Settings → Storage.

A restored or copied Suwayomi database can carry the same marker. There is no server-instance identifier or conditional-write API that distinguishes an identical clone at the same address. Use Connection → Separate this library's saved data when a copied server should be treated separately. Metadata checks are not atomic with server mutations. Restore recovery pauses writes from this client until confirmed; it cannot lock other clients. Abrupt termination immediately after metadata writes did not retain the marker in the first CI probe, so crash-durable server metadata is not claimed. See [identity implementation and evidence](LIBRARY_IDENTITY_2026-11-02.md) for validation boundaries.

## Local-source Date search sorting in Suwayomi v2.3.2243

This server version advertises a Date choice in Local-source search but applies title sorting regardless of that choice. Title ascending/descending works. Yomikura detects the affected source/version and marks Date unavailable instead of sending a known-ignored selection. Other sources retain their supplied sort choices. The backend behavior and the exact shipped bytecode were verified; see [catalog filter evidence](RELIABILITY_BATCH_7_2026-10-24.md).

## Local reliability verification

The [reliability handoff](RELIABILITY_STATUS_2026-10-24.md), [completion report](RELIABILITY_COMPLETION_2026-10-24.md) and [installed beta.2 verification](BETA_VERIFICATION_2026-11-03.md) distinguish implemented behavior from verification limits. Windows installer upgrades, saved reading across an unavailable backend and app restart, progress replay, interrupted downloads and recovery have direct installed-app evidence. Fully offline web/PWA deep links have browser coverage. macOS/Linux interactive use, signed-in provider behavior and spoken screen-reader output remain unverified.

The crop control is a fixed page magnification/clipping option, not automatic border detection. Remote/web import requires copying supported archives on the server; direct import is limited to a proven owned native Local directory.
