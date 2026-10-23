# Reliability batch 2: offline progress recovery

Date: 2026-10-23, Asia/Calcutta.

This batch implements G03 progress retention and replay, with the part of G13 needed to keep pending progress attached to its owning backend. It preserves the existing reader and application styling. Broader download-job and manga-preference identity work, reader continuity, migration and tracker/filter workflows remain separate work.

The first verified batch was checkpointed locally as `109a2f8`. The compiling progress foundation was checkpointed as `d0bde33` after 116 unit tests passed. Subsequent recovery fixes, regression tests and this report form the next local checkpoint. Nothing was pushed or published. The working files before this batch were also archived under ignored `.cache/progress-2026-10-23/starting-worktree.zip`.

## Implemented contract

- A usable page creates a durable reading intent immediately. The 750 ms delay now applies to network synchronization, not to the local save.
- The separate `yomikura-progress` IndexedDB database holds ordered operations, per-chapter desired state, history visibility and worker leases. Its transaction must complete before a local save is confirmed. The existing offline-cache database remains at schema version 4.
- Every operation captures a canonical HTTP(S) endpoint and live/demo namespace. Profile changes do not retarget pending requests. Host spelling, default ports and trailing slashes normalize; different hosts, paths, protocols and demo data remain distinct.
- A chapter signature checks manga ownership, names, chapter number and available source order before replay. Pending data belonging to a changed chapter record is retained for review. Freshly observed replacement records fence callbacks from earlier reader sessions.
- Automatic progress is coalesced per chapter while unsent. Explicit reset/unread operations remain barriers ahead of subsequent automatic reading. Local write order uses committed sequence numbers, rather than wall-clock timestamps.
- Network writes are serialized per backend. Web Locks coordinate tabs/processes; persisted leases provide a fallback and fence stale acknowledgements. A new process holding the Web Lock can recover an abandoned lease immediately.
- Acknowledging an older request cannot remove a newer operation or replace its desired state. Interrupted acknowledgements retain the operation for retry. Repeated writes converge to the same read flag and position.
- Reset and mark-unread advance a chapter epoch. Automatic callbacks captured before that action are rejected. Completion is preserved on reread, while a deliberate earlier reading position remains valid.
- Replay checks the active backend again before mutation. Explicit live clients cannot silently become demo clients while an old request is pending. A profile connection result cannot mark a different endpoint connected or exit a later demo selection.
- Automatic replay pauses on competing server progress. Confirmed choices can use saved progress or keep server progress. Those choices are tied to the reviewed sequence; a delayed choice cannot overwrite a newer reset.
- Pending state is projected over stale reader metadata and chapter filters. History reset/removal and progress synchronization remain distinct. Demo progress is retained separately without changing overlapping live cache/history IDs.
- The UI exposes pending synchronization and conflicts. A failed local transaction reports unsaved progress and sends no server mutation. Local cache/history are derived views; retained heads can reconstruct them when needed.
- Retry runs at startup, after new work, on online/focus events, and every 15 seconds while the app is open. This is not a background service after the app closes.

Chapter bulk read/unread, history reset, library read actions, migration progress copying and duplicate merging use the same coordinator. Migration and duplicate removal require an acknowledged progress copy before removing the original library entry. This does not close the broader migration-safety finding.

Automatic download removal still requires acknowledged completion and the correct active backend. Its local cache deletion uses the captured backend rather than resolving whichever profile is current later.

## Source map

| Concern | Implementation |
|---|---|
| Captured endpoint and chapter ownership | `src/api/suwayomi/backendIdentity.ts` |
| Atomic intents, sequence/epoch state, leases and acknowledgement | `src/api/suwayomi/progressStorage.ts` |
| Preflight, serial replay, derived views and conflict choices | `src/api/suwayomi/progressSync.ts` |
| Startup/reconnect/retry and cache invalidation | `src/hooks/useProgressSynchronization.ts` |
| Pending/conflict controls | `src/components/ProgressSyncStatus.tsx` |
| Immediate reader persistence and pending restoration | `src/features/reader/ReaderPage.tsx`, `readerProgress.ts` |
| Explicit actions and pending chapter filters | `ChapterList.tsx`, `HistoryPage.tsx`, `LibraryPage.tsx` and progress-copy callers |
| Legacy endpoint spelling compatibility | `src/api/suwayomi/offlineCache.ts` |
| Stale connection-result protection | `src/stores/useSettingsStore.ts` |

The new development-only `fake-indexeddb@6.2.6` dependency tests transaction and replay logic. Its registry integrity was verified and installation used the existing store with a frozen lockfile and scripts disabled. Existing dependency versions were preserved. Browser restart checks use real Chromium IndexedDB and CacheStorage in dedicated profiles.

## Verification

All evidence paths below are relative to ignored `.cache/progress-2026-10-23/`.

| Check | Result | Evidence |
|---|---|---|
| Full unit/component suite | PASS: 129 tests, 22 files | `unit-final2.log` |
| Production typecheck/build | PASS | `build-final.log` |
| Full production browser suite | PASS: 45 tests, including the final conflict-choice guard | `browser-final.log` |
| Real Suwayomi regression suite | PASS: 11 connected workflows | `live-regressions.log` |
| Actual backend/browser recovery | PASS: composite stop/restart and offline-reset scenario | `live-attempt4.log`, `live-attempt4/` |
| Bundle budget | PASS: 746,872 JavaScript bytes; largest chunk 230,749 bytes | `bundle-verified.log` |
| Browser spec TypeScript | PASS | `browser-typecheck-verified.log` |
| Version synchronization | PASS; remains `1.0.25-beta.1` | Task command output |

### Production browser scenarios

The six new UI checks verify:

1. Read cached pages offline, close Chrome, reopen the same profile, retain the position, switch between two backends with overlapping IDs, and replay only to the owning backend.
2. Hold a completion response while another tab commits mark-unread, then release the old response. The final state remains unread at page zero; stale reader callbacks cannot undo it.
3. Detect competing server progress and explicitly choose the saved position.
4. Detect the same conflict and explicitly keep the server position.
5. Fail local progress storage and verify that the UI reports failure and no server mutation is sent.
6. Apply mark-unread to the current chapter filter while its server write is still pending, then reconnect and verify acknowledgement.

The suite also reruns the existing backup, reader, offline-preview, accessibility and UI regressions. API fixtures are used for controlled response timing and failure injection; these are separate evidence from the real-server runs.

### Real server recovery

The owned backend uses the project's official pinned Suwayomi v2.3.2243 JAR, SHA-256 `821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5`. It runs on loopback port 45689 with a fresh database, configuration and original synthetic CBZ under the workspace cache. Java child processes are hidden and only processes created by this test are stopped. JDBC startup output confirms the workspace database path.

The existing fixture at port 4567 is checked for its expected workspace path and original synthetic title. Both backends have chapter ID 1. The recovery test confirms the existing fixture's chapter state is unchanged while the owned backend is stopped, restarted, selected and synchronized.

Actual chapter metadata and PNG bytes are fetched from Suwayomi to prepare a device-cache fixture. That preparation is not presented as an ordinary web download workflow: web downloads still delegate to Suwayomi, as established by the architecture.

The completed test performs two Chrome restarts and three owned backend starts. It reads offline at page two, restores that position after browser restart, reconnects through the correct profile, completes the chapter, queues a history reset while the backend is stopped, and replays the reset after another browser/server restart. The final real server state is unread at page zero, with no pending operations. API responses are not mocked.

The 11 connected regressions additionally cover browsing/library membership, categories, page restoration, completion/history, server downloads, backup export/restore, bookmark filtering, rereading, storage-failure restore prevention, and explicit unread/reset.

## Failed attempts and limits

Failed logs, traces, profiles and fixture databases are retained.

- The initial dependency command selected a different pnpm store; it was stopped without changing global configuration. Re-resolution was avoided by verifying the exact new package and using a frozen cached install.
- An early browser fixture supplied different chapter identities through its detail and chapter endpoints. The ownership guard correctly refused it; the fixture was corrected. A separate run used an older production build without the new profile label, and was rebuilt.
- The real restart pass exposed abandoned-lease and worker-release/reconnect timing cases. Both now have focused regression tests.
- Reusing a previous browsing fixture produced different generated IDs. Each real recovery attempt now uses a fresh workspace database; old attempts were preserved rather than deleted.
- An immediate forced backend kill lost a recently acknowledged read flag in one run. The final network-outage test waits for client acknowledgement and 1.5 seconds of backend quiescence before termination. H2 documents a default 500 ms commit-to-log-flush delay, which is consistent with buffered server writes; this is not a proof of the exact cause in every backend deployment. See [H2 WRITE_DELAY](https://h2database.com/html/commands.html#set_write_delay).

This batch trusts explicit server acknowledgements. It does not guarantee backend power-loss durability, force server disk flushes, or certify native managed-engine shutdown. The immediate-kill result remains a separate engine/backend durability concern.

The supported mutation has no compare-and-set/version field. Preflight detects competing server edits, but another device can still write between that check and mutation. Perfect simultaneous multi-device conflict resolution is not claimed. Browser data eviction/clearing, host aliases, changed server addresses, server-instance identity, and provider-specific behavior also require separate contracts. Pending data is never automatically moved to a different address.

Library backups do not include this independent client database. Export/import of client preferences and pending state remains a separate recovery-scope item. Broad numeric-ID scoping in download bookkeeping and manga overrides is not closed by progress isolation alone.

New native-specific behavior was not introduced or certified here. The implementation and recovery verification were performed through the web application; the first batch's native backup evidence remains separate.

## Following batch

Continue with reader continuity: webtoon restoration and jumps, active-chapter controls and thumbnails, stable appended chapters, cached append resolution, and associated backend-scoped reader preferences. Keep migration/tracker/filter work behind verified backend contracts.
