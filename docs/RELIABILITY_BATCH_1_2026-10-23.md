# Reliability batch 1: retained backups and chapter state

Date: 2026-10-23, Asia/Calcutta.

This batch implements and verifies the first reliability repairs: G01 backup retention and restore protection, G04 automatic completion correctness, and G11 chapter-query consistency. It also repairs the offline thumbnail limitation exposed by the earlier browser restart check. This is a scoped implementation result, not closure of the parity roadmap.

This batch started on `main` at `1e8af90f1c99900ccf59ac3f66a8b0f2a9d5e948`. After verification, the user authorized local checkpoint commits while subsequent work continues. No push, PR or merge was made. The previously applied three-fix patch and its tests were preserved; the starting working changes were copied under ignored `.cache/reliability-2026-10-23/pre-existing-files/` and captured in `pre-existing.patch` before this batch.

## Resulting behavior

### G01: a URL is no longer treated as a retained backup

`createLibraryBackup` asks Suwayomi to export, downloads the artifact from the configured server, bounds its size, validates the gzip stream, and saves its bytes on the device. A returned server URL alone cannot record success. HTTP failures, interrupted downloads, invalid archives, storage errors and byte mismatches stop the operation.

| Platform | Retained storage | Confirmation |
|---|---|---|
| Web | Separate `yomikura-library-backups` IndexedDB database, partitioned by server URL | Wait for the write transaction to complete, read bytes back, compare them, then commit the verified record. |
| Tauri | App-local `library-backups` folder; on Windows `%LOCALAPPDATA%/app.yomikura/library-backups` | Write a candidate, read it back, compare bytes, rename it, then commit the verified manifest. |

Every saved backup records its purpose, server URL, timestamp and byte size. SHA-256 is recorded when Web Crypto is available; readback comparison is always required. Saved artifacts are checked again before export or restore. Existing recovery copies are not automatically removed.

The Backup settings panel lists manual, automatic and safety copies for the selected server. It supports export, restore and confirmed removal, and offers the native backup folder on desktop. Browser users are told that clearing browser data removes retained copies and that they should export a copy for independent storage.

Automatic schedules derive their last success from a retained, readable artifact for the current server. Legacy timestamps without a file do not postpone a backup. A profile change cannot attach an old operation's success to the new profile. StrictMode and profile-switch cases have focused regression tests.

Restore now runs through one protected path for uploaded files and saved copies. It first creates, saves and verifies a fresh safety copy. Upload cannot start while that step is pending or after it fails. The UI reports success only after the backend reports `SUCCESS`; an unfinished poll remains in progress. If the result cannot be confirmed, the retained safety copy is identified for recovery.

### Restore upload contract: an additional integration defect repaired

The first actual restore failed with `Field 'backup' has coerced Null value for NonNull type 'Upload!'`. The prior request mapped a file to `variables.input.backup`. Suwayomi v2.3.2243's multipart parser does not traverse nested objects.

The corrected request declares a top-level `$backup: Upload!`, supplies it as `restoreBackup(input: { backup: $backup })`, and maps the file to `variables.backup`. This was verified against the [pinned server parser](https://github.com/Suwayomi/Suwayomi-Server/blob/v2.3.2243/server/src/main/kotlin/suwayomi/tachidesk/graphql/server/JavalinGraphQLRequestParser.kt#L44-L107) and then against the real running server. The corrected restore reached confirmed server success; the failed attempt remains in the evidence directory.

Implementation: `src/api/suwayomi/backupStorage.ts`, `libraryBackups.ts`, `backupUpload.ts`, `src/hooks/useScheduledBackup.ts`, `src/components/settings/SavedBackupsPanel.tsx`, `BackupSettingsPanel.tsx`, and `src/pages/SettingsPage.tsx`. Native filesystem command permissions were added in `src-tauri/capabilities/default.json`.

### G04: automatic progress preserves completion and waits for usable images

Progress snapshots carry the owning chapter's existing read state. Reopening an earlier page preserves completion. Automatic deletion runs only for a newly completed chapter after the progress mutation succeeds; rereading does not repeat deletion.

Reader images report readiness only after the current image loads successfully. A selected, loading or failed final page cannot complete a chapter. Single-page completion waits for its image; a displayed double-page spread waits for both images. Webtoon progress requires both visibility and readiness. Observer ownership remains local to each image instance.

Progress acknowledgements no longer restore the viewport or rebuild the chapter stream merely because a chapter query refetched. Explicit mark-unread and reset actions still clear completion and saved position. This does not implement an ordered offline progress outbox or fully resolve continuous-reader active-chapter state.

Implementation: `src/features/reader/ReaderPage.tsx`, `ReaderImage.tsx`, and `readerProgress.ts`.

### G11: chapter actions refresh the queries that actually supply the list

Chapter mutations now invalidate `manga-chapters` alongside the dependent chapter, manga, library, updates and history views. A successful bookmark becomes visible in the current Bookmarked filter. Explicit read/unread/reset patches also update an existing device-cached chapter.

The shared helper is used by chapter bulk actions, library read actions, history reset, reader progress, migration and duplicate handling where those workflows change chapter state. A production browser regression checks bookmark → filtered list → mark-unread → unread list and reads the actual IndexedDB copy afterward.

Implementation: `src/api/suwayomi/chapterState.ts` and its callers.

### Offline previews

Full pages and thumbnail previews now share `useReaderImageSource`. Browser-cached pages resolve to owned blob URLs, which are revoked when replaced or unmounted. The restart test now requires the offline preview to decode successfully as well as the full reader image.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Unit/component suite | PASS: 95 tests, 18 files | `unit-attempt5.log` |
| Production TypeScript/build | PASS | `build-attempt5.log` |
| Bundle budget | PASS: 727,908 JavaScript bytes; largest chunk 230,640 bytes | `bundle-final.log` |
| Version sync | PASS: all four version declarations remain `1.0.25-beta.1` | Command output retained in the task |
| Browser-test TypeScript | PASS | `browser-typecheck-final.log` |
| Full production Chrome suite | PASS: 39 tests | `browser-attempt5.log` and `browser-attempt5/` |
| Connected Suwayomi workflows | PASS: 11 real-server checks | `live-final.log` and `live-final/` |
| Native compilation and launch | PASS | `native-build-attempt2.log` |
| Native backup artifact | PASS: 657 bytes, readback-confirmed, manifest checksum matched disk bytes | `native-disk-verification.json` |
| Native export | PASS: the requested copy exists in Downloads | `native-disk-verification.json` |
| Native process restart | PASS: the same saved filename appeared in Backup settings after a fresh process launch | `native-after-restart.txt` |
| Diff whitespace | PASS | `git diff --check` |

Evidence paths in this section are relative to ignored `.cache/reliability-2026-10-23/`. The normal browser suite uses isolated profiles and synthetic data. It covers retained backup export after browser restart with backend access failing, automatic backup persistence, storage-failure restore prevention, retained safety copies after success/failure, readiness-gated completion, rereading, local chapter state, offline previews, accessibility and existing UI journeys.

The connected test harness remains under `.cache/runtime-check-2026-10-23/`. It uses the real Suwayomi v2.3.2243 JAR pinned by the project, SHA-256 `821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5`. Before fixture mutations it checks the backend's workspace-local source path and the original synthetic title `Yomikura Runtime Test`. It does not install external source extensions or use a personal library. Its backend responses are not mocked.

All 11 connected checks passed together in the final run: browsing/library membership, category persistence, saved page restoration, completion/history, server download, real gzip export, immediate bookmark filtering, preserved completion on reread, successful restore with a retained safety copy, storage-failure prevention of restore upload, and explicit mark-unread/history reset. The final run completed in 1.8 minutes. The frontend at `http://127.0.0.1:5173` and disposable backend at `http://127.0.0.1:4567` were confirmed available before these checks.

The desktop test uses the workspace development executable with the real Tauri filesystem plugin. It establishes native compilation, launch, backup retention, export and relisting after process restart. It does not certify the installer, signed updater, complete managed-engine lifecycle or native restore UI.

## Failed attempts retained

- The first unit run discovered copied test snapshots under `.cache` and a complete mock missing a newly used real helper. Snapshot filenames were made nondiscoverable and the mock was changed to preserve real exports. Assertions subsequently passed.
- One live reader setup switched from Webtoon mode and assumed it was still on page one. The fixture now enters the target reader mode before navigation; the actual completion regression passed afterward.
- The first backup browser fixture incorrectly treated non-GraphQL requests as JSON operations. Correcting the fixture produced passing storage and restore checks.
- The failed real restore demonstrated the nested multipart defect above. It retained the safety copy. The repaired request then passed the real-server restore test.
- The offline restart fixture initially allowed a developer's running default backend to participate during setup. It now seeds its isolated server before startup and blocks every GraphQL endpoint.
- A combined eight-route accessibility test exceeded its shared 30-second test timeout on one run. Each route now runs independently with the same assertions and ordinary timeout. All eight passed; no accessibility threshold was weakened.
- The first native rebuild encountered the still-running test executable. After its process exited, the incremental build passed. The first write used an unsupported `ErrorOptions` type for this project's TypeScript library target; the error wrapper was adjusted without changing that target.
- Automatic approval review temporarily could not run further host checks because of an account usage limit. After the user resumed and current usage was available, reviewed execution succeeded. That interruption is not an application failure.

Raw failed logs, traces, screenshots and test profiles were preserved.

## Limits and next work

The first batch does not certify every feature. Remaining priority work includes durable ordered progress replay after outages, stronger backend identity handling, and continuous-reader active-chapter/navigation correctness. Source migration breadth, trackers/provider authentication, extension workflows, production PWA shell navigation, complete native lifecycle and platform-specific behavior need their own acceptance runs.

Backup retention is device storage, not protection against clearing browser data, disk loss or power failure. Those scenarios were not tested. Native writes use readback and rename; an operating-system flush/power-loss guarantee is not claimed. Backups contain Suwayomi library data, not downloaded page bytes or all Yomikura preferences. No automatic retention pruning was introduced.

Existing architecture and visual design were preserved. The frontend continues to delegate library/source/download operations to Suwayomi, with the established web/native download split.
