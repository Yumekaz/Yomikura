# Local reliability status and continuation handoff

Updated: 2026-10-24, Asia/Calcutta. This records implemented local work against the supplied 22-finding audit; it does not replace that audit or declare full Mihon parity. The original audit compared committed Yomikura `1e8af90f1c99900ccf59ac3f66a8b0f2a9d5e948` with Mihon `446f6df82c390ab760802c2fce3b677bce3f31c1`.

The shared web frontend was verified first. Native checks were performed where documented for batch 1; subsequent frontend tests do not automatically certify native storage, image fetching or engine lifecycle. UI/branding and the React/TypeScript/Tauri/Suwayomi boundaries are preserved.

## Finding status

“Implemented” below means the documented behavioral contract is implemented and tested, subject to each report's limits. It does not mean every native platform, third-party source or provider account was exercised.

| Finding | Local result | Evidence / outstanding boundary |
|---|---|---|
| G01 durable backup | Implemented | [Batch 1](RELIABILITY_BATCH_1_2026-10-23.md): retained/read-back artifact before success or protected restore; real multipart restore |
| G02 offline-capable routes | Implemented | [Initial patch validation](PARITY_LOCAL_VALIDATION_2026-10-23.md), restart tests; complete PWA shell availability is still G21 |
| G03 durable progress replay | Implemented | [Batch 2](RELIABILITY_BATCH_2_2026-10-23.md): persisted intent, ordered replay, resets, conflicts, restart/outage/profile checks |
| G04 completion/readiness | Implemented | [Batches 1](RELIABILITY_BATCH_1_2026-10-23.md) and [3](RELIABILITY_BATCH_3_2026-10-23.md): preserve reread completion, ready-image requirement and acknowledged-state guards |
| G05 webtoon restoration/jumps | Implemented | [Batch 3](RELIABILITY_BATCH_3_2026-10-23.md): actual geometry, delayed images, resize, real-server checks |
| G06 observer/DOM ownership | Implemented | Supplied patch applied and tested; chapter/page instances own their image target |
| G07 continuous-reader active chapter | Implemented | [Batch 3](RELIABILITY_BATCH_3_2026-10-23.md): visible owner, stable stream, controls/URL/paged mode/append recovery |
| G08 tracker search/binding | Implemented; provider-account validation open | [Batch 6](RELIABILITY_BATCH_6_2026-10-24.md): selected remote work, precise IDs, privacy, validated edits, local unlink |
| G09 completion-to-tracker synchronization | Implemented; provider-account validation open | Separate durable tracking retry after reading acknowledgement; manual-position override fences earlier intents |
| G10 migration safety | Implemented within supported mapping | [Batch 5](RELIABILITY_BATCH_5_2026-10-24.md): explicit review, complete loading, acknowledged copies, conservative replacement, real source checks |
| G11 chapter cache consistency | Implemented | [Batch 1](RELIABILITY_BATCH_1_2026-10-23.md); strengthened live/demo saved-copy regression in batch 8 |
| G12 source query navigation | Implemented | Shared route encoding, canonical `query`, legacy `search`, preserved saved links |
| G13 backend identity | Implemented for progress, reader settings, downloads and cache | [Batch 2](RELIABILITY_BATCH_2_2026-10-23.md), [4](RELIABILITY_BATCH_4_2026-10-23.md), [8](RELIABILITY_BATCH_8_2026-10-24.md); new native download run, address migration and database-generation identity remain open |
| G14 downloaded-library discovery | Open | Live library smart category still uses backend `downloadCount`; device-only saves are visible in Downloads but need separate availability predicates |
| G15 local-import paths/formats | Open | Align formats, prove managed-local destination and give remote-server instructions; test native permissions/collisions |
| G16 border cropping | Open | Existing fixed crop/zoom is not content-aware border detection; truthful relabelling or bounded image analysis required |
| G17 effective reader controls | Implemented | [Batch 4](RELIABILITY_BATCH_4_2026-10-23.md): scoped effective values, global inheritance, explicit legacy recovery |
| G18 catalog filters/saved filters | Implemented for supported backend dispatch | [Batch 7](RELIABILITY_BATCH_7_2026-10-24.md): typed controls, defaults, drafts, snapshots, preflight, pagination; unsupported backend choices explained |
| G19 update-feed completeness | Open | Capped upload-date listing still needs a supported discovery/pagination contract |
| G20 accessibility | Partial | Shared dialogs/focus, card naming and measured filter contrast improved; reader/control audit is not fully closed |
| G21 disconnected PWA navigation | Open | Cached reader tests keep the web shell reachable; no complete service-worker deep-link fallback guarantee |
| G22 continuation/list policy | Open | Stable continuous-reader ownership is implemented; chapter-list ordering/filter policy is not yet shared with continuation |

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

The verification commit containing this handoff also contains the final queue-mode and derived-cache corrections described in batch 8. Resolve its exact SHA from local history rather than treating a document's self-reference as a new source of truth.

## Current verification and evidence limits

- Full unit suite: 260 passing tests in 31 files.
- Final production build/application TypeScript, strict TypeScript for changed browser specs, bundle budget and version synchronization pass. The app version remains `1.0.25-beta.1`.
- Final full production Chrome suite: 90 passing tests. Real Suwayomi suite: 11 passing workflows. See [batch 8](RELIABILITY_BATCH_8_2026-10-24.md) for raw evidence and preserved failed attempts.
- Browser tests cover controlled failure contracts with actual Chromium storage. The real Suwayomi fixture separately verifies real requests and persisted library/reader/download/backup behavior. Its data and synthetic archives are confined to the workspace.
- All six trackers on the owned live fixture were signed out. Binding/synchronization browser tests simulate provider state; successful external account synchronization has not been certified.
- The actual Local source on v2.3.2243 advertises Date sorting but ignores its selected field. API experiments and the shipped JAR's bytecode establish that limitation. The client marks the specific unsupported option unavailable; no backend repair is claimed.
- Backend progress preflight and mutation are not an atomic compare-and-set transaction. Forced-stop experiments also observed buffered backend database writes; client acknowledgement is not a server power-loss guarantee.
- Browser storage can be evicted. A retained Suwayomi backup excludes independent client preferences, pending writes and downloaded page bytes. Client-state export remains separate future work.
- [REA/JADX report](PARITY_LOCAL_VALIDATION_2026-10-23.md): earlier static Yomikura bundle analysis and official Mihon APK inspection were actually performed. Their partial coverage and exact artifact digests are documented. No Android APK installation, ADB/runtime run or signing attestation was performed. Those older bundle graphs do not describe every later implementation change.

Raw failures and later passing evidence remain in ignored `.cache/` subdirectories for each batch. Those logs, browser profiles, test databases, APKs/JARs and machine-specific artifacts are local evidence, not publication inputs. The reports distinguish source verification, controlled simulation, real-server behavior and native checks.

## Suggested next bounded work

1. G14: distinguish on-device and on-server availability without changing backend `isDownloaded`. Test all four combinations, correct counts and profile isolation.
2. G22: share chapter ordering/filter policy with continuation; retain the active-owner and reset fences already verified.
3. G15: implement truthful managed-local versus remote import behavior with format, permission and collision checks before any native filesystem write.
4. Close the remaining G20 reader accessibility cases, then choose bounded implementations for G16, G19 and G21 using their actual backend/platform constraints.
5. Perform the outstanding installed native download/profile scenario and signed-in provider checks when their execution context is available.

Keep the established web-first workflow and local safety commits. Verify the live checkout/history before continuing; older audit documents and earlier reports are historical evidence, not instructions to discard newer work.
