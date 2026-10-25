# Reliability batch 6: tracker binding and completion synchronization

Date: 2026-10-24, Asia/Calcutta. Starting checkpoint: `a7c7cc8`. The compiling workflow was checkpointed as `868e843` after 217 unit tests and the production build passed. Subsequent provider-refresh, retry-status and error-message fixes form the verification checkpoint.

This batch implements G08 search/binding and G09 completion-triggered synchronization for the pinned Suwayomi contract. Account-provider execution is distinguished from controlled browser evidence below. No tracker credentials were supplied or configured.

## Linking and manual actions

- “Link Track” opens a search for the selected tracker. Results from a different tracker are rejected. Selecting a result presents its edition and privacy before the explicit link action.
- Binding uses `bindTrack` with manga ID, tracker ID and the selected remote ID. Remote IDs remain in their original string representation, including values above JavaScript's safe-integer range. Existing private state is preserved when the provider supports it. The returned owner, remote work and privacy must match the request.
- An already changed binding cannot silently become a different selected work. Requests capture their backend and live/demo mode; stale search results cannot update a different profile or manga view.
- Manual edits refresh the provider record first and send only fields changed in the form. Supported statuses/scores, zero scores, fractional positions and private settings are handled explicitly. A stale changed field requires review rather than overwriting newer data. Requested edits must be confirmed before the form reports success.
- Unlinking removes the local binding with `deleteRemoteTrack: false`, checks the resulting local records and preserves the remote entry.
- “Sync linked trackers” first attempts reading-progress replay and stops if that manga still has pending reading operations. It verifies linked records and clears matching durable retries only after confirmation.

Tracker error messages preserve local review/confirmation explanations. They no longer replace an unconfirmed edit with advice to switch manga sources. The same distinction now preserves `MigrationError` messages in the migration review.

## Durable automatic synchronization

An eligible reader completion is a finite positive chapter number, including fractions. Its successful reading acknowledgement and tracker retry marker are committed in the same IndexedDB transaction. The database remains `yomikura-progress` schema version 1; new head fields require no store upgrade. Historic completed records without markers are not silently backfilled; manual synchronization remains available.

The tracker worker is separate from reading replay. It coalesces pending heads for a manga, uses the captured backend and title identity, and checks current server state. Reading operations for that manga must settle first. No linked records means no provider update. Unknown, zero and negative chapter numbers do not invent external progress.

Web Locks serialize automatic synchronization, binding and manual edits across tabs. Persisted leases provide fallback ownership and fence stale status updates. A new completion can wake a worker already finishing; newer markers cannot be cleared by an older acknowledgement. A newly eligible completion can also confirm older retries for the same manga without leaving their old backoff errors visible.

Failures retain tracker markers while acknowledged reading progress stays saved. Retry delay increases from 15 seconds to at most 15 minutes. The app checks on startup, online/focus events and its existing periodic poll, while respecting backoff. The visible retry action forces an attempt. No work runs after the app closes; the next session resumes retained state.

The status distinguishes saved reading progress from pending tracker synchronization, reports sign-in/provider confirmation problems and allows a reviewed retry dismissal. A stale dismissal cannot clear a newer completion. Demo state is isolated and never sends live tracker requests.

## Reset and manual-edit precedence

Explicit unread/reset cancels unsent tracker eligibility. Automatic work rechecks pending intent and reading operations before sending an update. Confirming saved automatic completion during reading-conflict resolution retains its tracker eligibility; choosing server state does not invent one.

A manual tracker-position edit first commits a barrier through the reading intents already present when the edit began, before sending the provider update. If the barrier cannot be saved, no position edit is sent. A failed or lost provider response does not allow an older automatic completion to reverse that explicit intent. New reading activity remains eligible. Score, status and privacy edits do not suppress unrelated progress work.

The backend provides no conditional version spanning provider changes and local chapter updates. Already submitted requests cannot be recalled by a later reset/profile change. Preflights, serialization and durable sequence checks protect client ordering; they do not claim atomic multi-device or multi-provider updates.

## Pinned backend evidence

The pinned implementation can catch an individual provider failure and still return a GraphQL payload containing older database records. The client therefore refreshes every linked provider record and checks ownership and the eligible completed position before reporting confirmation. An expired or failing provider keeps the overall retry pending even if another provider succeeds. [Pinned tracker implementation](https://github.com/Suwayomi/Suwayomi-Server/blob/1d583ca4a718646e17a4c62d23fe8e5edccaf774/server/src/main/kotlin/suwayomi/tachidesk/manga/impl/track/Track.kt#L368-L449).

`bindTrack` uses a searched remote ID and chosen tracker. The update path can construct a provider update from cached record fields; refreshing before a manual edit prevents an unrelated stale position from being sent with a score/status change. [Binding/update implementation](https://github.com/Suwayomi/Suwayomi-Server/blob/1d583ca4a718646e17a4c62d23fe8e5edccaf774/server/src/main/kotlin/suwayomi/tachidesk/manga/impl/track/Track.kt#L158-L346), [GraphQL tracker operations](https://github.com/Suwayomi/Suwayomi-Server/blob/1d583ca4a718646e17a4c62d23fe8e5edccaf774/server/src/main/kotlin/suwayomi/tachidesk/graphql/mutations/TrackMutation.kt#L110-L275).

Official source copies used for inspection remain in ignored evidence storage. No provider assets, credentials or proprietary extension content were copied into the application.

## Source map

| Concern | Implementation |
|---|---|
| Supported search/bind/refresh operations and complete record fields | `src/api/graphql/queries/tracking.graphql`, generated SDK |
| Backend/record ownership, linking, edits and verified provider refresh | `src/api/suwayomi/trackingActions.ts` |
| Shared manual/automatic lock ownership | `trackingCoordination.ts` |
| Durable coalescing, replay and backoff | `trackingSync.ts` |
| Atomic completion markers and manual-edit barriers | `progressStorage.ts`, reading conflict resolution in `progressSync.ts` |
| Startup/reconnect triggers and visible retry status | `useProgressSynchronization.ts`, `ProgressSyncStatus.tsx` |
| Typed record UI, work selection and scoped editing | `TrackerPanel.tsx`, `TrackerWorkSearch.tsx`, `TrackerEditForm.tsx` |

## Verification

Evidence is retained under ignored `.cache/tracking-2026-10-24/`, with persistent Chrome profiles in ignored `.cache/tracker-profile-*`. Failed attempts are preserved.

| Check | Result | Evidence |
|---|---|---|
| Full unit suite | PASS: 220 tests, 28 files | `unit-final.log` |
| Production build / application TypeScript | PASS | `build-final.log` |
| Final affected tracking browser scenarios | PASS: 12 tests after the barrier-order guard | `browser-final.log`, `browser-final/` |
| Full production browser suite | PASS: 75 tests before the final barrier-order guard | `browser-full.log`, `browser-full/` |
| Real Suwayomi regression suite | PASS: 11 workflows | `live-regressions.log`, `live-regressions/` |
| Pinned-schema operation validation/code generation | PASS | `codegen-attempt2.log` |
| Browser TypeScript in strict mode | PASS using existing Node declarations | `browser-typecheck-verified.log` |
| Bundle budget | PASS: 791,899 JavaScript bytes; largest chunk 230,760 bytes | `bundle-verified.log` |
| Version synchronization | PASS: unchanged `1.0.25-beta.1` | Task output |
| Signed-in external tracker account | NOT PERFORMED: none available on owned fixture | `live-tracker-capabilities.json` |

The 44 additional unit tests cover binding ownership/precision/privacy, stale fields, provider confirmation, fractional/special numbers, atomic markers, reset/dismissal/manual-edit sequence guards, persisted backoff, deduplication, worker wakeups, profile/demo isolation and fallback lease coordination. The final guard adds a local-storage failure case: no provider position edit is sent if its earlier-intent barrier cannot be saved.

The 12 browser scenarios exercise the actual production UI and Chromium storage with controlled backend/provider responses:

1. Search one tracker and bind the chosen work with a large remote ID and private state.
2. Save zero score and a fractional manual position; unlink locally while retaining the remote fixture entry.
3. Reject an ignored server edit while keeping the form available.
4. Synchronize acknowledged completion once and avoid reread duplicates.
5. Retain a retry when HTTP success contains unconfirmed provider progress, then recover explicitly.
6. Retain completion on authentication expiry and recover after sign-in becomes valid.
7. Preserve fractional automatic progress and skip zero/unknown negative numbers.
8. Close Chrome completely, reopen the same profile, recover the durable tracker retry and avoid replay after acknowledgement.
9. Switch backends with overlapping manga/chapter/tracker IDs and replay only each owner's updates.
10. Hold an earlier completion acknowledgement, save a manual tracker-position edit, release the acknowledgement and verify that the edit remains in effect.

The three chapter-number variants count as separate browser tests. These scenarios simulate provider state; they do not certify an external provider account. The owned live server reports all six available trackers signed out. Its schema and ordinary application workflows are verified separately without authenticating or changing any provider account.

### Preserved failures

The first full unit run exposed that the isolated AppShell test harness omitted the application's `FeedbackProvider`. The harness now uses the same provider boundary as the application; the full suite passed afterward. The first tracking browser run passed 11 scenarios and exposed the generic error formatter hiding an unconfirmed-edit explanation; the product formatter was corrected. A standalone browser typecheck initially omitted strict mode and Node declarations; it now uses the project's strict behavior and already installed declarations without adding dependencies.

No new native WebView/provider-account run was performed. No dependency or version changes, pushes or PRs were made. Source filters and remaining download-job identity work are still separate outstanding work.
