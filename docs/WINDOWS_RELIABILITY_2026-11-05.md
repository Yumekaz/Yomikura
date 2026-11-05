# Windows reliability follow-up — November 5, 2026

This work continues the released-app verification after v1.0.25. It is delivered in [PR #20](https://github.com/Yumekaz/Yomikura/pull/20). No outcome below is established merely by adding a test.

## First batch: real automatic upgrades

The workflow downloads the official v1.0.24 and beta.5 Windows installers, checks their release digests, installs each on a separate fresh Windows runner and starts a real pinned Suwayomi Local library with original-art pages. A chapter is saved through the released UI. Its records and page hashes are compared after the released application's actual updater installs v1.0.25. Server read state, bookmark, partial position, membership, profile and theme are checked separately; beta.5 also receives an unsynced UI note because v1.0.24 has no book-note feature.

The target installer is not manually substituted for the updater. No updater HTTP response or native plugin is mocked in this journey. Runner-only WebView inspection uses an app-scoped loopback diagnostic policy; elevated WebView2 hosts ignore environment flags. This is not a change to shipping builds or a request to alter a user's machine.

Earlier failed attempts are retained: first a JavaScript-escaped registry path, then an unavailable inspection connection before the elevated-host constraint was identified. Those attempts did not complete an upgrade and are not counted as product failures or passing evidence.

## Update recovery feedback

The updater banner and Settings now distinguish check/download/install errors from an update that installed but could not relaunch. Readers receive a next action and an official-release link; technical details stay expandable. Verification, permission and insufficient-space errors have distinct guidance. Failed checks cannot become a false up-to-date success, and failed attempts clear stale download progress.

Focused regression tests cover failed checks and retry, successful installation followed by relaunch failure, and failure classification. Full application/browser/native checks remain required before merging or creating a follow-up release.

## Remaining planned batches

The earlier released-upgrade workflow [41959252209](https://github.com/Yumekaz/Yomikura/actions/runs/41959252209) passed both official upgrade paths, saved-page integrity, beta.5 unsynced-note retention, offline app restart and acknowledged progress replay at source `17a4876`. The repetition covered 16 chapter visits and 48 decoded page visits in 10.162 seconds; it is not prolonged-session evidence. The resulting Windows installer/source run [41959711595](https://github.com/Yumekaz/Yomikura/actions/runs/41959711595) also passed. See the [browser setup review](BROWSER_SETUP_REVIEW_2026-11-05.md) for the separate guide and graceful-server-restart checks.

1. Complete client-state recovery: a versioned recovery package, explicit optional saved-page export, integrity checks and a review before connecting imported state to any backend. Server archives, device preferences, draft notes, pending reading/tracker work and page bytes have different ownership and restoration rules. Restoring one must not silently replay another client's pending writes.
2. Recovery into an empty profile, with interruption, malformed-package, quota/permission and mismatched/identical-clone scenarios. Keep original imports and pre-import state recoverable. Cross-database/cache restoration requires a durable staged journal; it cannot be described as one atomic IndexedDB transaction.
3. Sustained reading and failure recovery: measured memory/responsiveness across repeated chapters, navigation modes, queues, cancellation, app restart and isolated-backend outages. Report the tested duration and fixture size; do not call a short loop an hours-long reading test.
4. Installed verification of the resulting follow-up package, compiled on GitHub, and a concise PASS / FAIL / NOT PERFORMED report. A passing source test does not update the already published v1.0.25 installer.

The normal laptop library, private Mihon references, existing release assets and publisher-signing configuration are outside this batch's mutations. Real tracker authentication, Windows Hello user verification and physical macOS/Linux hardware remain separate contexts.
