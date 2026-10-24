# Local reliability status and continuation handoff

Updated: 2026-10-24, Asia/Calcutta. This records implemented local work against the supplied 22-finding audit; it does not replace that audit or declare full Mihon parity. The original audit compared committed Yomikura `1e8af90f1c99900ccf59ac3f66a8b0f2a9d5e948` with Mihon `446f6df82c390ab760802c2fce3b677bce3f31c1`.

The shared web frontend was verified first. The selected remaining work and actual Windows Tauri/WebView2 checks are recorded in [the completion report](RELIABILITY_COMPLETION_2026-10-24.md). Native and external-provider coverage are distinguished explicitly. UI/branding and the React/TypeScript/Tauri/Suwayomi boundaries are preserved.

## Finding status

“Implemented” below means the documented behavioral contract is implemented and tested, subject to each report's limits. It does not mean every native platform, third-party source or provider account was exercised.

| Finding | Local result | Evidence / outstanding boundary |
|---|---|---|
| G01 durable backup | Implemented | [Batch 1](RELIABILITY_BATCH_1_2026-10-23.md): retained/read-back artifact before success or protected restore; real multipart restore |
| G02 offline-capable routes | Implemented | [Initial patch validation](PARITY_LOCAL_VALIDATION_2026-10-23.md), restart tests and the G21 production shell checks |
| G03 durable progress replay | Implemented | [Batch 2](RELIABILITY_BATCH_2_2026-10-23.md): persisted intent, ordered replay, resets, conflicts, restart/outage/profile checks |
| G04 completion/readiness | Implemented | [Batches 1](RELIABILITY_BATCH_1_2026-10-23.md) and [3](RELIABILITY_BATCH_3_2026-10-23.md): preserve reread completion, ready-image requirement and acknowledged-state guards |
| G05 webtoon restoration/jumps | Implemented | [Batch 3](RELIABILITY_BATCH_3_2026-10-23.md): actual geometry, delayed images, resize, real-server checks |
| G06 observer/DOM ownership | Implemented | Supplied patch applied and tested; chapter/page instances own their image target |
| G07 continuous-reader active chapter | Implemented | [Batch 3](RELIABILITY_BATCH_3_2026-10-23.md): visible owner, stable stream, controls/URL/paged mode/append recovery |
| G08 tracker search/binding | Implemented; provider-account validation open | [Batch 6](RELIABILITY_BATCH_6_2026-10-24.md): selected remote work, precise IDs, privacy, validated edits, local unlink |
| G09 completion-to-tracker synchronization | Implemented; provider-account validation open | Separate durable tracking retry after reading acknowledgement; manual-position override fences earlier intents |
| G10 migration safety | Implemented within supported mapping | [Batch 5](RELIABILITY_BATCH_5_2026-10-24.md): explicit review, complete loading, acknowledged copies and conservative replacement; completion work also retains middle category nodes |
| G11 chapter cache consistency | Implemented | [Batch 1](RELIABILITY_BATCH_1_2026-10-23.md); strengthened live/demo saved-copy regression in batch 8 |
| G12 source query navigation | Implemented | Shared route encoding, canonical `query`, legacy `search`, preserved saved links |
| G13 backend identity | Implemented within endpoint/mode identity | [Batches 2](RELIABILITY_BATCH_2_2026-10-23.md), [4](RELIABILITY_BATCH_4_2026-10-23.md), [8](RELIABILITY_BATCH_8_2026-10-24.md) and [actual native verification](RELIABILITY_COMPLETION_2026-10-24.md); address migration/database-generation identity remain open |
| G14 downloaded-library discovery | Implemented | Separate device/server/either views, deduplicated counts, profile isolation and explicit unavailable server state offline; backend flags remain unchanged |
| G15 local-import paths/formats | Implemented within managed-local contract | Owned engine/directory proof, supported headers/names, size bounds, create-new/readback, remote instructions; actual native form, collision and denied-permission checks |
| G16 border cropping | Implemented by truthful relabelling | Fixed page crop explains the existing uniform magnification/clipping. Content-aware border detection is not implemented or claimed |
| G17 effective reader controls | Implemented | [Batch 4](RELIABILITY_BATCH_4_2026-10-23.md): scoped effective values, global inheritance, explicit legacy recovery |
| G18 catalog filters/saved filters | Implemented for supported backend dispatch | [Batch 7](RELIABILITY_BATCH_7_2026-10-24.md): typed controls, defaults, drafts, snapshots, preflight, pagination; unsupported backend choices explained |
| G19 update-feed completeness | Implemented | Complete node pages, discovery/publication modes, known library-addition boundary, stable ordering, pagination and retained-page retry |
| G20 accessibility | Targeted cases implemented; spoken output unverified | Labelled controls, shared category focus lifecycle, editable/control shortcut guards, visible keyboard focus and reachable reading surface; automated checks do not certify full conformance |
| G21 disconnected PWA navigation | Implemented within retained-storage contract | Versioned complete shell/lazy-chunk precache, uncached navigation fallback, safe worker lifecycle and fully offline browser tests |
| G22 continuation/list policy | Implemented | Scoped order/direction/status/group policy shared by list, Resume, history-next and reader controls; frozen entry sequence preserves anchors |

## Local safety checkpoints

These commits are on the local checkout. None of this continuation's changes has been pushed or submitted as a PR.

| Commit | Checkpoint |
|---|---|
| `109a2f8` | Supplied three fixes plus retained backups, restore and chapter-state corrections |
| `d0bde33` | Durable progress foundation |
| `ed34929` | Verified offline progress recovery |
| `773e8fc` | Reader continuity |
| `8558ed2` | Scoped reader settings and development watcher correction |
| `5dbdf4c` | Migration foundation |
| `a7c7cc8` | Verified migration |
| `868e843` | Tracker workflow foundation |
| `7a96b07` | Verified tracker workflows and manual-position barrier |
| `eec348e` | Catalog filter foundation |
| `42315ea` | Verified catalog filters and demonstrated Local-source version guard |
| `254023b` | Scoped download registry, metadata and page bytes |
| `0c5566b` | Final batch-8 verification and initial continuation handoff |
| `9789eb8` | Device/server availability and shared chapter policy |
| `b51c981` | Bounded imports into the owned managed engine |
| `f8f7926` | Keyboard/modal behavior and truthful fixed-crop label |
| `585b754` | Discovery pagination and complete offline web shell |
| `cc1760c` | Actual native contract/persistence corrections and scoped offline recovery |
| `b7c3d9b` | Complete backend node collections, middle entries/categories and history continuation |

The full-node collection correction and final verification commits follow in local history. Resolve the exact current SHA from the checkout; this dated document preserves the tested contract and remaining limits.

## Current verification and evidence limits

- Full unit suite: 295 passing tests in 38 files; Rust unit suite: 11 passing tests. Required Rust formatting/lint and current frontend build checks are recorded in the completion report.
- Final production build/application TypeScript, strict TypeScript for changed browser specs, bundle budget and version synchronization pass. The app version remains `1.0.25-beta.1`.
- The final full-node correction passes 103 production browser tests and 14 real-server scenarios: 11 application workflows, two reader scenarios and real discovery/publication pagination. The native test variant also passes actual copy/download/profile/restart and denied-write checks. Evidence and limits are in [the completion report](RELIABILITY_COMPLETION_2026-10-24.md); earlier reports retain their historical counts.
- Browser tests cover controlled failure contracts with actual Chromium storage. The real Suwayomi fixture separately verifies real requests and persisted library/reader/download/backup behavior. Its data and synthetic archives are confined to the workspace.
- All six trackers on the owned live fixture were signed out. Binding/synchronization browser tests simulate provider state; successful external account synchronization has not been certified.
- The actual Local source on v2.3.2243 advertises Date sorting but ignores its selected field. API experiments and the shipped JAR's bytecode establish that limitation. The client marks the specific unsupported option unavailable; no backend repair is claimed.
- Backend progress preflight and mutation are not an atomic compare-and-set transaction. Forced-stop experiments also observed buffered backend database writes; client acknowledgement is not a server power-loss guarantee.
- Browser storage can be evicted. Native preferences use a synchronous local authority with an ordered scoped file recovery mirror. A Suwayomi backup still excludes independent client preferences, pending writes and downloaded page bytes; client-state export remains separate future work.
- [REA/JADX report](PARITY_LOCAL_VALIDATION_2026-10-23.md): earlier static Yomikura bundle analysis and official Mihon APK inspection were actually performed. Their partial coverage and exact artifact digests are documented. No Android APK installation, ADB/runtime run or signing attestation was performed. Those older bundle graphs do not describe every later implementation change.

Raw failures and later passing evidence remain in ignored `.cache/` subdirectories for each batch. Those logs, browser profiles, test databases, APKs/JARs and machine-specific artifacts are local evidence, not publication inputs. The reports distinguish source verification, controlled simulation, real-server behavior and native checks.

## Remaining external validation and separate backlog

1. Verify a signed-in tracker provider when an authorized test account is available. The owned fixtures have no signed-in provider; no real provider success is claimed.
2. Perform spoken screen-reader validation and macOS/Linux native runtime checks. Windows UIA, keyboard/browser checks and the isolated native variant are documented separately from installer/public-release certification.
3. Keep server-address migration, database-generation identity, client-state export and the secondary parity backlog separate from these completed bounded fixes.
4. Treat content-aware image border detection as a future feature; the current fixed-crop control is labelled according to its actual behavior.

Keep the established web-first workflow and local safety commits. Verify the live checkout/history before continuing; older audit documents and earlier reports are historical evidence, not instructions to discard newer work.
