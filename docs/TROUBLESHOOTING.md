# Troubleshooting Yomikura

## The app stays on “Connecting”

On the first desktop launch, wait briefly while the private Java runtime and Suwayomi backend are prepared. If it fails, use the displayed retry or diagnostics action.

If you configured a remote server, confirm that the URL opens from the same machine and that the server is still running. For a local server, the usual address is `http://127.0.0.1:4567`.

## Java or backend startup failed

Do not install random Java builds or delete the data folder first. Retry once, then open diagnostics and inspect the Yomikura/Suwayomi logs. If the selected folder is inaccessible, choose a different empty folder and retry.

## A browser tab named “Library – Suwayomi” opens

That tab is Suwayomi's own fallback interface, not Yomikura. Managed Yomikura storage now disables this auto-open setting, so restart Yomikura once after updating. Continue using Yomikura itself; the local server should remain quietly in the background.

## No extensions appear

Yomikura does not bundle extensions. Add a trusted **Extension Store** descriptor under Extensions → Stores, then refresh its catalogue. Stores display the publisher name and signing-key fingerprint reported by Suwayomi; verify both before installing extensions.

If a store saves but discovers zero extensions, do not assume it worked. Check the displayed error. A certificate, rate-limit, DNS, or store-format error belongs to the upstream source path and should be reported with the exact error text. On Windows local-engine mode, Yomikura uses Windows' trusted certificate store so managed-network certificates can work without changing Java manually.

## A source or chapter fails

Retry once. If the source reports a certificate, timeout, rate-limit, Cloudflare, or not-found error, try another installed source. Repeated failures across unrelated sources usually indicate a Suwayomi, network, or system-date problem.

## Downloads are incomplete

On Desktop, Yomikura saves a verified local copy for offline reading. On the website, the same button queues the chapter in Suwayomi because a browser cannot safely cache pages from every remote server. Watch progress in Downloads and keep the server running while reading server-managed downloads.

Cancel the failed item, retry it once, and confirm that there is enough free disk space. Yomikura should not treat a partial cache as a completed chapter. If the same chapter repeatedly fails, preserve the logs and report the title, source, chapter, and error.

## Uninstalling the app

The installer removes the application. User-selected storage is separate and should remain unless you explicitly remove it through the app's data-management controls.

## Reporting a bug

Include the Yomikura version, operating system, whether the server is local or remote, the exact steps, and the first relevant error from diagnostics. Never include passwords, private URLs, tokens, or personal files.
