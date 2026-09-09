# Yomikura public beta

Yomikura is collecting reproducible feedback for its web/PWA and Windows desktop client. The beta is for reliability and usability, not for testing untrusted sources or sharing private library data.

## Before you begin

1. Use a recent Yomikura build and record its version from **Settings → About**.
2. Use a test library or make a Suwayomi backup first. Do not use an irreplaceable library as the first beta test.
3. Keep your server, extension, and browser/Windows versions available for a report.
4. Never share credentials, API tokens, private server URLs, cookies, manga archives, or uncropped diagnostic logs.

## Recommended beta journeys

Run one journey at a time and note the exact result.

| Journey | What success looks like |
| --- | --- |
| Connect | Invalid URLs explain the recovery; a valid local or remote server remains connected after reload. |
| Extensions | A trusted Store shows its signing identity; install/update failure leaves an existing extension usable or explains recovery. |
| Browse and read | Search a title, open a chapter, close the app/page, reopen it, and confirm progress resumes. |
| Downloads | Queue one chapter, interrupt the client, reopen it, and confirm the queue or recovery state is clear. |
| Data safety | Create a backup; only restore a disposable/test backup and confirm Yomikura creates a safety backup first. |
| Desktop lifecycle | Install, launch, close, relaunch, update, and uninstall while confirming the user-selected data folder remains intact. |

## If anything looks wrong

Stop before repeating a destructive action. Preserve the existing data folder, take a cropped screenshot, and use the [Beta feedback form](https://github.com/Yumekaz/Yomikura/issues/new?template=beta_feedback.yml). For a reproducible defect, use the standard [bug report form](https://github.com/Yumekaz/Yomikura/issues/new?template=bug_report.yml).

The form asks whether data may have changed unexpectedly. That signal is treated as high priority. Yomikura does not automatically upload logs or library data.
