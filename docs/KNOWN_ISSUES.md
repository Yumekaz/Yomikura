# Known issues

## Unsigned installers

Windows installers are not Authenticode-signed and macOS packages are not notarized while project signing applications and credentials are pending. SmartScreen or Gatekeeper can therefore display an unknown-publisher warning. Verify release checksums and download only from the official repository.

## First launch requires external downloads

Local desktop mode downloads pinned Java 21 and Suwayomi components from their official GitHub releases. Corporate proxies, TLS interception, blocked GitHub access, low disk space, or an interrupted connection can stop setup. Retry after correcting the network or storage problem; do not delete an existing library folder as a first response.

## Third-party sources can break independently

Yomikura does not control extension repositories or source websites. A source may fail because its site changed, rate-limited the server, rejected its certificate, or enabled anti-bot protection. Try another source and preserve the exact diagnostic message when reporting a repeated failure.

The local engine disables Suwayomi's optional KCEF browser provider so first launch does not silently download a separate Chromium runtime. Sources that require an interactive embedded browser challenge are therefore not supported in local-engine mode.

## Platform coverage

Windows receives the automated install, local-engine readiness, shutdown, uninstall, and storage-preservation test. macOS and Linux are compiled and packaged in CI, but their installed packages do not yet receive the same native lifecycle automation.
