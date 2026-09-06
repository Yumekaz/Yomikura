# Installation and system requirements

## Supported desktop systems

- Windows 10 or Windows 11, 64-bit.
- macOS builds are produced for current Intel and Apple Silicon systems, but remain unsigned and unnotarized until Apple distribution credentials are configured.
- Linux packages target Ubuntu 22.04-compatible desktop environments with WebKitGTK 4.1.

The desktop application uses Microsoft WebView2 on Windows. Current Windows 10 and Windows 11 installations normally include it; install the Microsoft WebView2 Runtime if Yomikura opens as an empty native window.

## Storage and network

Allow at least 1 GB of free disk space for Yomikura's local engine before adding a library. Covers, chapter pages, backups, and extensions require additional space according to usage.

The optional local-engine setup downloads a pinned Eclipse Temurin Java 21 runtime and Suwayomi Server release over HTTPS. A blocked GitHub connection, TLS inspection, or insufficient disk space can prevent first-run setup. Yomikura never bundles sources or extension repositories.

## Safe installation

1. Download installers only from the project's GitHub Releases page.
2. Compare the downloaded file against the release's `SHA256SUMS-*.txt` file.
3. Keep Yomikura's application folder separate from the user-selected library storage folder.
4. Until platform signing is enabled, Windows and macOS may warn that the publisher is unknown.

See [Troubleshooting](TROUBLESHOOTING.md) for recovery steps and [Known issues](KNOWN_ISSUES.md) for current distribution limitations.
