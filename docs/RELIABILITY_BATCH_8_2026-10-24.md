# Reliability batch 8: download and cached-page ownership

Date: 2026-10-24, Asia/Calcutta. Starting checkpoint: `42315ea`. The download/cache implementation was checkpointed locally as `254023b` after 259 unit tests, the production build and 12 affected browser checks passed. Final review adds mode-specific server-queue query keys, a demonstrated queue regression, and refreshed progress views for the separately owned demo cache.

This completes the download/controller/cache portion of G13 within the tested contract. Progress ownership and reader-preference ownership are covered by batches 2 and 4. It does not certify a shared registry across multiple native processes, database replacement at the same endpoint, or arbitrary server-address migration.

## Implemented behavior

- Every local download captures canonical endpoint, live/demo mode, chapter ID, platform and its own attempt token. Running work uses that captured identity after a profile change. Public numeric chapter/controller maps contain only the currently selected backend's entries.
- Queue intent must finish its IndexedDB transaction before metadata or page requests begin. A failed save reports a storage error and sends no download request. Restored failed jobs remain available to retry; restoration errors are visible.
- Retry, cancellation, deletion and cache clearing use captured targets. Deletion waits for the producer and its pending persistence to settle before removing its completed record. A late page response cannot recreate a deleted chapter. Shutdown pauses queued/running jobs; a stale startup restore cannot restart them after that lifecycle boundary.
- Native downloads retain the existing Rust page-fetch command, with the captured server URL. Demo fetches use the browser path. Live website downloads still delegate to Suwayomi's queue; this change does not silently turn a web server download into a device cache.
- Each attempt writes page bytes under unique CacheStorage keys carrying its owner. Those query markers are storage keys only and are never sent to the image server. An incomplete replacement cannot overwrite an earlier complete copy's bytes.
- Completed metadata is committed only after all pages are written. Its original page paths, actual network URLs and stored byte keys remain distinct. Matching retained progress takes precedence over older metadata returned during the download.
- Cancellation/failure removes only unreferenced attempt bytes. Metadata belonging to another profile and pages still referenced by another completed record are retained. Clear This Server's Offline Cache removes only the selected endpoint/mode, its queued jobs and its identifiable orphan attempts.
- Live chapter/job keys retain their existing URL-plus-ID shape. Demo keys use a separate prefix. New rows have an explicit mode field; legacy rows use the application's existing `[Demo]` title convention when that field is absent. An explicit live flag wins even for a title beginning with that text. A live write preserves a legacy demo row before reusing its former key.
- Equivalent endpoint spelling normalizes during lookup/deletion. Different addresses remain separate. There is no automatic assumption that a new address represents the old server's database.
- Reader pages and previews require metadata owned by the selected endpoint/mode before resolving cached bytes. Profile changes fence delayed lookups and revoke old blob URLs. A small, invalidated page index avoids scanning IndexedDB independently for every thumbnail.
- Local saved chapters remain visible while the server queue loads or fails. Server queue queries also include live/demo identity, use an abort signal, and capture their mutation target explicitly. Leaving demo mode cannot display its cached empty queue as a confirmed live result while the live request is pending.
- Live and demo progress update their own cached chapter views. Legacy URL/ID history remains protected from overlapping demo writes.

The existing storage database stays at version 4; no store/index schema migration is required. Device-wide storage usage is labelled separately from the selected server's chapter list. Library backups remain separate from these cached pages and jobs.

## Source map

| Concern | Implementation |
|---|---|
| Captured job registry, persistence, lifecycle and cancellation | `src/stores/useDownloadStore.ts` |
| Canonical metadata/jobs, attempt ownership, reference-safe cleanup and byte lookup | `src/api/suwayomi/offlineCache.ts` |
| Reader and thumbnail cache resolution | `src/features/reader/useReaderImageSource.ts`, `readerChapter.ts` |
| Derived cache progress | `src/api/suwayomi/progressSync.ts` |
| Captured reader, chapter-list and library download actions | `ReaderPage.tsx`, `ChapterList.tsx`, `LibraryPage.tsx` |
| Scoped clear/delete and truthful storage controls | `src/pages/SettingsPage.tsx`, `OfflineSettingsPanel.tsx` |
| Saved copies during queue failure; queue mode identity | `src/features/downloads/DownloadsPage.tsx` |

## Verification

Raw logs, traces, fixtures and failed attempts are retained under ignored `.cache/downloads-2026-10-24/`.

| Check | Result | Evidence |
|---|---|---|
| Full unit suite | PASS: 260 tests, 31 files | `unit-final.log` |
| Production build / application TypeScript | PASS | `build-verified.log` |
| Final full production browser suite | PASS: 90 tests | `browser-final.log`, `browser-final/` |
| Final real Suwayomi regression suite | PASS: 11 workflows | `live-verified.log`, `live-verified/` |
| Affected browser checks at implementation checkpoint | PASS: 12 tests | `browser-attempt1.log`, `browser-attempt1/` |
| Regression against the previous build | FAIL as expected: demo queue shown during pending live request | `queue-scope-before.log`, `queue-scope-before/` |
| Strict TypeScript for changed browser specs | PASS | `browser-typecheck-final-selector.log` |
| Bundle budget | PASS: 812,779 JavaScript bytes; largest chunk 230,846 bytes | `bundle-verified.log` |
| Version synchronization | PASS: unchanged `1.0.25-beta.1` | `version-verified.log` |
| New native WebView download/profile scenario | NOT PERFORMED | Native IPC boundary simulated in unit tests |

The 18 added unit tests use real fake-indexeddb transactions and controlled page responses. They exercise overlapping IDs on two endpoints, live/demo separation, held in-flight native fetches, owner-specific cancellation, stale cache loads, scoped deletion/clearing, orphan attempts, intent-storage failure, deletion before a producer finishes, failed replacement retention, pending completion, shutdown/restoration ordering, URL compatibility and immediate ownership-index refresh. The Tauri command is mocked: those tests verify the frontend's captured arguments and lifecycle, not the native binary's execution.

The five new Chrome scenarios use real IndexedDB and CacheStorage with synthetic images. They verify profile-specific saved lists and actual returned page bytes, deletion while preserving the other profile, scoped orphan cleanup, saved access during HTTP 503 queue failure, and demo-to-live queue isolation with the live response deliberately held. The existing bookmark/unread browser check now seeds both modes explicitly and verifies that the demo saved copy is retained unchanged when the live copy is marked unread.

The real-server suite uses the owned workspace Suwayomi v2.3.2243 fixture and validates its local-source path/title before mutations. It checks browsing/library membership, category persistence, page restoration, completion/history, server-managed downloads, actual gzip backup, chapter filtering, rereading, restore protection and explicit unread/reset. Provider accounts and personal library data are not used.

### Preserved failures and corrections

- The first full production run passed 88/89. Its older chapter-action fixture used a demo title without an explicit mode in a live profile. The new legacy-demo isolation correctly excluded that row. The fixture now states its live mode explicitly and seeds a separate demo copy; the ownership boundary was retained.
- Final review found an independent queue-query omission: live and demo results shared a key. A new browser scenario failed against the previous production build while the live response was held. The key now includes the captured backend/mode; mutation targets are captured too.
- The first real-server regression run passed 10/11. Two owned synthetic catalog fixtures now contain the same title substring, so an older broad test locator was ambiguous. The harness uses the original fixture's exact accessible title. The corrected rerun passed all 11.
- The first 90-case run passed 89 and verified the new held-response isolation assertions, then encountered an ambiguous selector for the live queue's cover/title links. The final visible-title assertion is now specific; the earlier failed trace remains in `browser-verified/`.
- Earlier unit/build/browser attempts remain alongside their later passing evidence; they are not replaced or represented as passes.

## Limits and remaining work

No new installed Tauri/WebView download run was performed. Earlier native backup/export/restart evidence remains historical and does not certify these download changes. An already running native fetch may finish before the frontend can observe cancellation; the frontend waits and fences its storage writes. Independent native windows do not have a tested shared download registry.

Browser storage remains subject to browser eviction. Interrupted owned attempts can leave bytes after a hard process exit; the selected-server clear action can remove identifiable orphan attempts. Unowned legacy bytes are not guessed to belong to an arbitrary profile. Replacing a database at the same URL or moving it to another address still requires an explicit identity/recovery policy.

G14 downloaded-library discovery, G15 local-import paths/formats, G16 border cropping, G19 updates completeness, G20 remaining accessibility, G21 fully disconnected PWA navigation and G22 shared continuation policy remain outside this batch. No dependency/version changes, pushes or PRs were made.
