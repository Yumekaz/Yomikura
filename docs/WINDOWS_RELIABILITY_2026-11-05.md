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

## Device recovery

Backups includes a versioned device file for reading and appearance preferences, note drafts, pending chapter progress, and optional saved chapter pages. File metadata and pages have separate SHA-256 integrity checks. The staged file and pre-import preferences survive a restart. Retrying adds complete missing chapters and keeps existing copies. Each pending update can only be sent after the reader compares it with the connected library and approves it. A recovery receipt prevents an interrupted import from applying the same update twice.

[Verify 45541396845](https://github.com/Yumekaz/Yomikura/actions/runs/45541396845) passed a Windows export with Suwayomi stopped and a fresh Chromium import against the same verified library. The recovered chapter opened offline, and progress reached the server only after review. The browser fixture separately passed a simulated quota failure during the second page, a reload and retry, refusal of a different library at the same address, and rejection of a corrupted file. Mihon's restore fix supplied the acceptance case that recovered pages must show up and open through the reader. [Mihon restore source](https://github.com/mihonapp/mihon/blob/v0.21.3/app/src/main/java/eu/kanade/tachiyomi/data/backup/restore/BackupRestorer.kt) · [User report and fix](https://github.com/mihonapp/mihon/issues/2574)

Keep the separate Suwayomi archive for library contents. A server restored from a `.tachibk` may have a new library marker and new record IDs, so the staged device file only attaches to the original verified library. Identical cloned markers are indistinguishable. Server-owned downloads, tracker credentials and automatic tracker jobs remain outside the device file. Optional downloaded pages are capped at 2 GB per file. A safe remap after a full server restore remains open.

The **Verify** workflow's **candidate_upgrade** input tests the Windows artifact from that run over the public v1.0.25 installer. It records the candidate digest and verifies that the running app retained an existing library, saved pages, preferences and an unsynced note. An unpublished artifact exercises manual installation in place. The stable update feed still serves the current public version. The test repeats two chapters over ten minutes, samples WebView heap, cancels a staged download, injects a storage quota error, and reopens a saved chapter after an app restart and server outage.

The normal laptop library, private Mihon references, existing release assets and publisher-signing configuration are outside this batch's mutations. Real tracker authentication, Windows Hello user verification and physical macOS/Linux hardware remain separate contexts.
