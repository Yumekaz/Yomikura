# Reliability batch 5: reviewed migration and verified transfers

Work started 2026-10-23 and verification continued 2026-10-24, Asia/Calcutta. Starting checkpoint: `8558ed2`. The compiling implementation was checkpointed locally as `5dbdf4c` after 172 unit tests and the production build passed. Subsequent confirmation checks, regression coverage and this report form the verification checkpoint.

This batch addresses G10 for source migration and routes duplicate merging through the same safety contract. It retains the existing visual system and backend responsibilities. No source extensions, tracker accounts or external provider credentials were installed or configured.

## Behavior and ownership

1. Selecting a search result prepares a review. It does not add the destination or remove the original from the library. Selecting the same manga is disabled and rejected by the service.
2. The pinned backend's `fetchMangaAndChapters` refreshes destination metadata and chapters first. Separate `GetMigrationChapters` requests load all chapter pages with stable ID ordering, a manga condition and forward cursors. Changed totals, duplicate IDs, incorrect manga ownership and unusable/repeated cursors stop preparation.
3. The review shows source-to-destination matches, unmatched and ambiguous counts, and skipped page positions. Negative/unknown numbers do not match by number. A unique normalized name can match a special chapter. Duplicate numbers require unique disambiguation, and multiple source chapters claiming one destination become ambiguous rather than choosing the first.
4. The default action copies selected state and keeps the original. Users can deselect matched chapters. Empty targets, zero matches and an empty selection cannot start a migration. Unmatched/ambiguous rows cannot be selected.
5. Automatic copying preserves destination completion and bookmarks. Partial positions transfer only with known equal page counts and a valid source index. Incomparable partial positions are disclosed and block replacement. An invalid legacy target position can be replaced by a valid comparable source position.
6. Replacement is a separate, explicit choice. It requires every source chapter to map unambiguously, every saved source state to be selected, and partial positions to be transferable. A selected partial copy can proceed while retaining the original.
7. Named categories are merged with existing destination categories. The special default category is not inserted as a named-category assignment. Tracker bindings, reader preferences and downloads are not transferred by this workflow.

Every operation captures the canonical endpoint and live/demo mode. Active-backend checks run before subsequent stages and writes. Explicit live SDKs cannot become demo clients after a profile change. The source title and selected destination source are checked before displaying the prepared review.

## Copy, confirmation and retry

Before copying, retained progress is given a chance to synchronize. Source state and destination chapter structure are loaded again and compared with the reviewed records. Pending local state participates in review, but is never accepted as proof of a server-confirmed copy.

The destination is added only after validation. Progress uses the durable coordinator with captured chapter identity and required acknowledgement. Started writes settle before a partial failure is exposed or a retry begins. Successful partial transfers remain available; they are not rolled back over possible newer destination data. A retry recomputes monotonic patches against current destination state.

After copying, fresh server queries verify destination membership, named categories, chapter structure, read/bookmark flags and comparable partial positions. Position verification remains mandatory even if an earlier pending intent made the newly computed patch empty. Source state is rechecked before replacement. Only then may the original leave the library.

A lost removal response is checked against server membership. Confirmed removal can complete successfully; confirmed retained membership remains retryable. If membership cannot be determined, the UI reports uncertainty instead of claiming the original was kept. In-flight requests already submitted to the captured server cannot be recalled by a subsequent profile change.

The backend does not offer one transaction or conditional version spanning chapter writes, category changes and library membership. These preflights and confirmations reduce unsafe transitions; they do not claim atomic multi-device migration. Copies can be partially applied on failure, with the original retained until required verification. Source records are not deleted by the client workflow.

## Implementation map

| Concern | Source |
|---|---|
| Matching, ambiguity, page-position policy and settling concurrent writes | `src/components/source/chapterMigration.ts` |
| Backend capture, complete loading, preflights, copy, verification and uncertain membership | `src/components/source/mangaMigration.ts` |
| Search, preparation, execution state and accessible dialog focus | `SourceMigrationModal.tsx` |
| Selection, mismatch counts and copy/replace choice | `MigrationReviewPanel.tsx` |
| Shared duplicate workflow and Unicode-aware name grouping | `src/components/library/DuplicateScanner.tsx` |
| Pinned-schema operations | `src/api/graphql/queries/migration.graphql`, generated SDK |

The generated SDK was first written to ignored evidence storage and compared before adoption. The pinned schema added only the three intended operations (94 generated lines); existing definitions were preserved. Demo handlers implement these operations without using a live backend.

## Verification

Raw logs, fixture roots, screenshots, server output and traces are retained in ignored `.cache/migration-2026-10-23/`. These artifacts span midnight; the directory retains its start date.

| Check | Result | Evidence |
|---|---|---|
| Full unit suite after confirmation hardening | PASS: 176 tests, 25 files | `unit-full-attempt2.log` |
| Production typecheck/build | PASS | `build-final.log` |
| Production browser regression baseline | PASS: 63 tests | `browser-full.log` |
| Final browser regression after confirmation hardening | PASS: 63 tests | `browser-final.log`, `browser-final/` |
| Real Suwayomi migration | PASS: copy and idempotent replacement | `live-attempt1.log`, `live-attempt1/` |
| Browser-spec TypeScript | PASS | `browser-typecheck-verified.log` |
| Bundle budget | PASS: 771,146 JavaScript bytes; largest chunk 230,760 bytes | `bundle-final.log` |
| Version synchronization | PASS: unchanged `1.0.25-beta.1` | Task output |
| Real chapter cursor contract | PASS: first and final page loaded with the returned cursor | `live-cursor-contract.json`, `live-cursor-continuation.json` |

The nine production browser scenarios cover review before membership changes, complete chapter pagination, default copy/category union, explicit replacement, user-selected partial copying, empty destinations, ambiguous matches, changed page counts, failed-transfer retry, closing/focus restoration, and duplicate merging preserving bookmarks and partial reading. Controlled API responses inject failures; those scenarios are separate from real-backend evidence. The remaining browser suite reruns prior backup, offline/progress, reader, settings, UI and automated accessibility regressions.

### Real server

The harness creates a fresh loopback Suwayomi v2.3.2243 instance on port 45690, using the previously verified official JAR with SHA-256 `821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5`. It copies only the existing synthetic test CBZs into two owned local-source folders. Java is hidden; only its owned child is stopped afterward. Source-path checks and JDBC startup output confirm that both content and database are under the workspace fixture root. No API responses are mocked.

The two real browser scenarios passed in Chrome against the web app. The first reviews two fetched chapters, confirms no early destination library addition, copies completed and partial/bookmarked state plus category union, and verifies that both titles remain in the library. The second reopens the already copied mapping, explicitly replaces the original without needing new progress patches, and verifies retained source chapter records, bookmarks/position and original synthetic archive files. JSON responses and screenshots are attached to the trace evidence.

### Preserved failed attempts

- The first helper test run had one incorrect expectation for a fixture containing a single valid mapping. The valid case was retained and a separate actual collision case was added; the corrected focused suite passed.
- A test used `Array.at`, which is outside the project's ES2020 library target. It was replaced with ordinary indexing; the project target was preserved.
- The first browser run passed eight scenarios and failed the duplicate entry point because the test opened `/settings/library`. The scanner lives under `/settings/advanced`; the corrected targeted test passed, followed by the full suite.
- An attempted file-replacement patch failed before deleting the old modal. The prepared replacement was copied into place and typechecked; no source content was lost.

## Limits and remaining work

Live verification used synthetic local-source content. It does not certify arbitrary external source pagination/content equivalence, provider outages, or tracker accounts. Matching remains a reviewable number/name policy, not content recognition. No native WebView migration run was performed; no Rust/native changes were needed for these shared frontend workflows. The duplicate scan still covers at most 1,000 entries and now discloses that cap.

Tracker search/binding/synchronization, source filter workflows and the remaining download-job portion of G13 are still separate outstanding work. G22 reader continuation policy and other audit findings are not closed by this migration batch. No pushes or PRs were made.
