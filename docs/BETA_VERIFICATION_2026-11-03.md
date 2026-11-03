# Windows beta verification

Beta.2 completed the baseline checks below, then a final native edge case found that offline recent reading could link to an unsaved chapter. The error route also had poor light-theme contrast and browser-specific wording. Its unpublished draft workflow was stopped and its tag retained. Beta.3 corrects those paths and passed the implementation and installed-app checks described next.

## Final beta.3 implementation and installed checks

Commit `ed9a72664dccef5ca9a6229b2c80d84679762a9e` passed all jobs in [run 41594835988](https://github.com/Yumekaz/Yomikura/actions/runs/41594835988): 490 unit tests, 231 browser tests plus the focused chapter-menu check, 25 Windows Rust tests, 9 release-artifact tests, typechecking, audit, build/budgets, private Java verification, installer lifecycle and real Suwayomi identity/restore checks.

The GitHub-built `Yomikura_1.0.25-beta.3_x64-setup.exe` was verified before running. Artifact ZIP SHA-256: `1224844a87fbce6b166bb5b7a5b91ce733dd9b61c57ea03aa03e336d0a952289`. Installer SHA-256:

```text
cc38871eb7d8f0bf4ff9d0c23b525745dad4a678b424efd01fdc27014f2f94f5
```

The normal Windows in-place upgrade completed and About confirmed `1.0.25-beta.3`. The original library reopened with one book, one device download and Chapter 2 / Page 4 unchanged. The current light Moonstone appearance remained selected.

Native beta.3 regression results:

- With the disposable backend stopped, Last read retained the latest chapter and page, explained that the chapter was not saved, and offered Read saved chapters instead of linking to an unavailable reader route.
- That action opened the four real saved chapter records with the selected-library total of 18.9 MB.
- Opening the unsaved chapter from retained History showed a themed, readable recovery panel with plain-language connection guidance, Retry reader, Read saved chapters and Connection settings. Browser-only diagnostics and hard-coded development addresses were absent.
- The recovery tests also passed in dark Ink & Ember and light Moonstone through automated contrast checks. The availability message wraps in compact layouts instead of being truncated.

The first beta.3 upgrade attempt delegated to a non-targetable upgrade uninstaller and did not establish installation success. Its exact setup/helper processes were recorded and cancelled without requesting filesystem removal. The retry explicitly selected Do not uninstall and completed in place. One coordinate action was rejected by automatic approval review; selecting the named safe accessibility control succeeded. These attempts are preserved privately and are not counted as extra successful upgrades.

The real Asura pass rendered The Greatest Estate Developer, SSS-Class Suicide Hunter, Surviving the Game as a Barbarian and Nano Machine across this installed QA sequence. New reading positions for the latter three were independently confirmed on Suwayomi without marking partial chapters complete. History showed one latest SSS-Class entry after two chapters were opened. The normal library was not filled with additional test titles; opening their chapters creates reading history.

Failed device-download records remain retained. After switching into an unavailable profile, their job projection waits for connection verification; saved chapters remain readable throughout. This is not a claim of automatic retry before reconnection.

Tag-triggered draft packaging and verification of the final uploaded assets are separate release gates. The release notes must link their completed run and identify whether the final draft installer received an additional native smoke check. No public publication or merge is part of this verification.

## Baseline beta.2 candidate and evidence

Version `1.0.25-beta.2` is synchronized in the frontend and all native manifests. It does not reuse the published `v1.0.25-beta.1` tag.

The implementation was verified in [run 41589044345](https://github.com/Yumekaz/Yomikura/actions/runs/41589044345), commit `d3256c209969f045721d9cbd487abcd9c88fabb0`. All three jobs passed:

- 489 unit tests in 72 files.
- 229 browser interaction tests and the separate chapter-menu check.
- 25 native Rust unit tests on Windows.
- 9 release-artifact, manifest-routing and checksum reconciliation tests.
- Typechecking, production dependency audit, production build and bundle limits.
- Production-pinned Java archive download, SHA-256 verification and private Java 21 launch without system Java on the child process's PATH.
- Windows installer lifecycle and the real Suwayomi database replacement/restore checks.

No application compilation or native build ran on the test laptop. The installed candidate came from [passing run 41584201971](https://github.com/Yumekaz/Yomikura/actions/runs/41584201971), commit `fc8125a2df1554253b0d79423e195cd45ab5d60c`. Application, native, dependency and shipped-asset source are identical between that commit and the final verified implementation; later commits add verification scripts and CI gates.

GitHub artifact ZIP SHA-256:

```text
f26516c36f7d6ce10dc017e2ff8f9dad2aeb2a18ae86cc89cfeae8ba4c91fa35
```

Installed `Yomikura_1.0.25-beta.2_x64-setup.exe` SHA-256:

```text
07956af51650fed838fed39790dfa054288793a835f28458a0ce5d84211e169c
```

The artifact ZIP matched GitHub's recorded digest before extraction. Windows publisher signature status is unsigned. The normal Explorer installer completed an in-place upgrade; the installed About screen confirms beta.2. Existing library data, profiles and saved chapters were retained.

## Installed offline and recovery results

Tests used a separate real Suwayomi database with original Yomikura demo artwork. The user's normal library remained separate. The laptop's internet connection stayed available; only the disposable library server was stopped.

| Journey | Observed result |
| --- | --- |
| Save and read online | Device chapter saved; server recorded page 2. |
| Backend outage | Saved reader advanced to page 5 and retained pending device progress. |
| App restart during outage | Normal shortcut relaunch opened the offline library; saved images, thumbnails and page 5 survived. Reading continued to page 6. |
| Backend recovery | Automatic replay cleared the pending update; a read-only server query confirmed page 6. |
| Cancel an active download | A delayed loopback connection kept a fresh test job active. Cancel restored its Save action; the cancelled title and job were absent from Saved chapters. |
| Interrupt a transfer | Stopping the disposable backend after two of eight pages retained a failed job with Retry. Previously saved chapters stayed readable. |
| Restart with the failed job | The same failed attempt reappeared after closing/reopening Yomikura. |
| Retry after recovery | Retry completed all eight pages and produced the fourth saved chapter. The cancelled job did not return. |
| Upgrade to beta.2 | Existing normal library, source extension, profiles, test downloads and reading positions remained. |
| Beta.2 cold offline reading | A saved chapter opened after a full restart with its backend unavailable. Images and thumbnails rendered; uncached continuation was unavailable. |
| Beta.2 reconnect in the reader | The offline continuation notice cleared, the current page stayed at page 3, pending progress synchronized to page 3, and Next became available for the uncached second chapter. |
| Continue after beta.2 recovery | Next opened that uncached second chapter and rendered its images. |
| Scoped saved-size summary | The updated test-library header showed four saved chapters / 18.9 MB, instead of the old all-profile estimate. |
| Beta.2 interrupted-download label | Failure after two of eight pages showed the comic title and “Chapter 2,” with Retry; the internal chapter ID was absent from the main label. |

## Reader and visual checks

The normal Windows shortcut and title-bar icon remained branded. The installed About screen reported beta.2 and explained stable update checks. A real stable-feed request completed successfully before the upgrade; no downgrade or automatic installation was attempted.

The original library reopened after test-profile switching with its one saved book, one device download and Chapter 2 / Page 4 unchanged. The Asura catalogue loaded real titles, SSS-Class Suicide Hunter's details and chapter list opened, and two chapters rendered. Thumbnail and keyboard navigation advanced reading; a server query confirmed page 4 of its first chapter without completion. The Greatest Estate Developer's saved progress remained separate from the disposable fixture.

Window sizing was exercised at 912×714 and maximized 1280×752. At the compact width, Statistics was originally inaccessible and light Moonstone's active navigation had poor contrast. Beta.2 exposes all seven navigation destinations and uses a readable palette accent. Browser coverage additionally clicks Statistics and checks overflow/accessibility at 430 pixels in light Moonstone and dark Ink & Ember. This browser viewport is not physical phone testing.

The controlled connection delay was test infrastructure in a private local folder. It was not added to the product or shipped with the installer. Forced process interruption was limited to a verified disposable-server PID and start time; the normal database was not replaced or restored.

## Fixes from the beta pass

- Refresh the reader's fallback chapter sequence after reconnection, keeping the active page and restoring uncached continuation.
- Persist comic/chapter names in queued and failed device-download jobs, including restart/retry. Older jobs without a name remain usable without exposing an internal ID as the main label.
- Display saved byte totals for the selected library, rather than all app profiles.
- Keep Statistics reachable below the desktop-sidebar breakpoint and make active bottom navigation readable in light palettes.
- Explain that application update checks follow stable releases; previews use manual installer downloads.
- Prepare draft releases, flatten downloadable checksum names, reconcile architecture-renamed assets using the original build digest, verify updater routing and verify payload signatures with Minisign in the release workflow.

The release-artifact workflow is exercised by the tag-triggered draft build separately from branch verification. A passing branch run does not prove every uploaded multi-platform release asset has passed that final gate.

## Limits and preserved failures

The first isolated startup failed under the restricted execution environment because Java's preferences migration could not access its normal registry location. Retrying with normal runtime permissions succeeded. Those raw logs remain private.

The new updater-target validator initially rejected `x86_64`; its pattern was corrected. One new storage-summary fixture initially waited less than the existing retry interval. An existing preferences fixture could remount during initial identity discovery; it now represents a consistently verified connection. All affected assertions remain, and the full suite passed afterward. Earlier failing logs, browser screenshots and traces are retained privately.

Native coverage is Windows on one laptop, supplemented by disposable Windows/Linux GitHub runners. It is not independent human feedback, signed-in provider testing, a spoken screen-reader session or a macOS/Linux interactive certification. The private Java probe verifies download, integrity and launch; it does not exercise every first-run wizard action or interrupted component download. A forward automatic update needs a newer published stable release; the installed stable-feed check alone is not an update-installation rehearsal.

The [library identity limits](LIBRARY_IDENTITY_2026-11-02.md) still apply: identical copied markers cannot be detected automatically, client preflight is not an atomic cross-client transaction, and immediate upstream termination did not establish crash-durable metadata.

Personal Mihon screenshots, library databases, downloaded pages, raw diagnostics and machine-specific paths are excluded from the public source and release notes.
