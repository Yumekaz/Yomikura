# Local parity implementation and REA follow-up

Date: 2026-10-23, Asia/Calcutta.

Historical checkpoint for the supplied three-fix patch and REA research. Later backup, reader, chapter-cache and offline-preview work is recorded in [reliability batch 1 verification](RELIABILITY_BATCH_1_2026-10-23.md).

The three supplied parity fixes are applied locally. Unit/component tests, application typechecking, the production build, bundle limits, and Chrome browser checks passed. REA actually analyzed selected Yomikura production bundles and the official Mihon v0.21.2 APK through JADX. This report records the executed scope and its limits; it does not close the remaining parity backlog.

## Starting point and changes

The starting checkout was clean on `main` at `1e8af90f1c99900ccf59ac3f66a8b0f2a9d5e948`, matching the supplied audit. The ZIP SHA-256 was `9b2744516fd0d322423de1ea22372353fc4e6030d7f5afcd6299965a595011a8`.

The mailbox patch passed an applicability/whitespace check and was applied with `git apply`. Its three commits were **not** recreated. No commits, pushes, pull requests, or merges were made.

| Finding | Applied behavior | Implementation |
|---|---|---|
| G02 | Check for chapters cached for the active backend before replacing local-capable routes with onboarding. Wait for cache discovery; retain onboarding when no usable metadata is found; keep settings subroutes accessible. | `src/components/layout/AppShell.tsx` |
| G06 | Observe each reader image's own element through a ref and use a unique instance ID. | `src/features/reader/ReaderImage.tsx` |
| G12 | Use shared source-search URL encoding; read canonical `query` and legacy `search`, with an explicitly empty canonical query taking precedence. | `src/features/browse/sourceBrowseRoute.ts` and the three browse screens |

The supplied patch adds 25 component regression cases and the development-only `happy-dom` dependency. Two existing browser selectors were updated to find the full reader image within its container, since page-number-only IDs are no longer valid. A new persistent-profile Chrome test verifies cached reading across a browser restart.

## Executed validation

Environment: Windows x64, Node 22.20.0, pnpm 11.1.2, installed Google Chrome. Dependencies were installed from the supplied lockfile with lifecycle scripts disabled.

| Check | Observed result | Scope |
|---|---|---|
| Initial `pnpm test` | 40 tests passed; two suites failed during module loading with temporary-file `ENOENT` errors. | No failed assertions; raw failure retained. |
| Baseline with workspace-local `TEMP` and `TMP` | 49/49 tests, 12 files passed. | Unmodified baseline. |
| Patched `pnpm test`, workspace-local temporary directory | 74/74 tests, 15 files passed. | Existing tests plus 25 supplied regression cases. |
| `pnpm run typecheck` | Passed. | Application TypeScript projects. |
| `pnpm run build` | Passed. | 1,865 transformed modules; production Vite output. |
| `pnpm run check:bundle` | Passed. | 65 files, 1,166,699 total bytes, 712,708 JavaScript bytes; largest JavaScript chunk 230,587 bytes. |
| Full `pnpm exec playwright test` | 22/22 passed. | 18 desktop UI tests, three quality gates, one new restart test. |
| New browser-test TypeScript check | Passed with the installed transitive Node type directory explicitly selected. | The ordinary application typecheck excludes browser test files. |
| `git diff --check` | Passed. | Tracked changes. |

The supplementary browser-test typecheck was:

```powershell
pnpm exec tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --lib 'ES2022,DOM' --typeRoots node_modules/.pnpm/node_modules/@types --types node tests/e2e/offline-restart.spec.ts
```

Earlier attempts with an unquoted library argument and without the transitive Node type directory are retained separately. They were invocation/type-resolution failures, not failed browser assertions.

### Restart scenario and failed attempts

`tests/e2e/offline-restart.spec.ts` uses a dedicated Chrome profile and synthetic SVG pages. It writes real IndexedDB chapter metadata and CacheStorage page bytes, closes Chrome, relaunches it with the same profile, and opens a direct reader URL while backend requests fail. It verifies the image is decoded from a blob URL and then checks Downloads → Read and the offline Library listing. Demo mode is disabled. No personal browser profile or user library is used.

The first attempt could not create Chrome CacheStorage under the long test-output profile path. A shorter workspace-local profile path resolved that failure. The next attempt reached the cached reader but found both a thumbnail and the full page with the same accessible image name; the test selector was narrowed to the full reader-image container. These failed traces, screenshots and profiles remain intact. The corrected focused test and the subsequent full 22-test suite passed. The screenshot check was subsequently strengthened to wait for the full page to enter the viewport and finish its opacity transition; that stronger focused run also passed. Its screenshot was visually inspected and shows the synthetic page.

This verifies device cache access with the application shell reachable. It does **not** establish production PWA shell availability while completely disconnected, real Suwayomi shutdown/restart behavior, cache eviction guarantees, or native Tauri storage durability.

### Additional observed offline limitation

The restart screenshot shows the full cached page but broken thumbnail previews. `ReaderOverlay.tsx:369–373` assigns `buildPageUrl(idx)` directly to thumbnail images, while the full `ReaderImage` resolves bytes from CacheStorage. Backend requests in this fixture deliberately fail, so the thumbnails cannot retrieve those direct URLs. This is a separate, demonstrated preview-availability limitation exposed by the local test; it is not counted as one of the three fixes. A follow-up should resolve previews through the same device-cache path and verify thumbnail decoding with the backend unavailable.

## REA setup and provenance

REA 6.7.0 was installed under ignored `.cache/rea/cli` using the official `rea-agents` npm package with install scripts disabled. The package's declared Node range accepts the installed Node 22.20.0. `rea setup` was not run; no agent registration, global REA installation, system Java installation, or persistent environment configuration was changed.

The system Java runtime lacked `jdk.compiler`. A portable Eclipse Temurin JDK was downloaded into the workspace, verified against official metadata, and selected only for analysis subprocesses.

| Input | Identity and verification |
|---|---|
| REA | npm `rea-agents@6.7.0`; repository `morluto/rea`; registry integrity `sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLgxoMdKuqIYGCoBfD4fXkOhFw==` |
| JDK | Temurin 21.0.12.1, Windows x64; 205,073,461-byte ZIP; SHA-256 `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e`, matching Adoptium metadata |
| JADX bridge distribution | `jadx-headless-mcp-0.7.1-all.jar`; 42,619,858 bytes; SHA-256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`, matching REA's pinned metadata |
| Mihon APK | Official `mihon-arm64-v8a-v0.21.2.apk`; 27,732,654 bytes; SHA-256 `dcfe07027cb000fac92f10303e4bc98feca3e6a4aeb026aaafce8fbe9e5c423f`, matching the GitHub release asset digest |
| Mihon release tag | Annotated tag object `d6b3b3f1961508c686047f63cd4157eba73187f7`, resolving to source commit `9612d955db3165e1578fdf9ff19ca9b7762c4a46` |

The release source commit differs from audit main `446f6df82c390ab760802c2fce3b677bce3f31c1` and the older pre-existing local reference checkout. The matching tag's reader and backup source files were downloaded separately. Resolving the release tag and matching the asset digest does not constitute APK signing-certificate verification or a reproducible-build attestation.

Official references: [REA repository](https://github.com/morluto/rea), [Android analysis guide](https://github.com/morluto/rea/blob/main/docs/android-analysis.md), [JavaScript workflow guide](https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md), [Mihon release](https://github.com/mihonapp/mihon/releases/tag/v0.21.2), [Adoptium JDK metadata](https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse).

## Yomikura analysis actually completed

REA analyzed the produced `dist` directory with six selected JavaScript files: AppShell, ReaderPage, GlobalSearchPage, SourceBrowsePage, sourceBrowseRoute and offlineCache. The first sandboxed attempt failed during directory-entry identity checking, before source analysis. A permission-reviewed run outside the sandbox succeeded with `integrity_policy=fail` and **zero integrity contradictions**; the integrity check was not bypassed.

| Measurement | Result |
|---|---|
| Root artifact digest | `24d300e0c146477b96941e3c3e3ba34b02b1fd59e1a9823458d514817875b716` |
| Analysis Evidence ID | `ev_688a2898064e6840c83e1a62cdee44d829947412a31258c415450ef60913d056` |
| Parsed scope | Six selected files, 95,679 text bytes, 19,021 AST nodes, zero parse failures |
| Structural graph | 146 nodes, 301 edges; partial coverage |
| Semantic graph | 11,830 nodes, 16,823 relations, 4,703 explicit unknowns; partial coverage |
| Unselected scope | 48 inventoried relevant files were not parsed |

The structural storage observations identify CacheStorage access to `yomikura-page-cache` in the compiled reader and cache module, and an IndexedDB open operation in the cache module. The analyzer left the IndexedDB name unresolved; the source establishes `yomikura-offline`.

Real `trace-application-feature` calls were completed for the cache module and the shared source-search route module. Each matched two module identities and traversed the connected selected/import graph. The resulting graphs remain partial because their dependencies include unselected sources. These are static syntax/import relationships, not observed execution paths or proof that the remaining application has no defects. The extractor's 193 recorded observations are **not 193 bug findings**.

## Mihon APK analysis actually completed

All APK operations used the verified JAR, the portable full JDK, two active JVM processors and a 1,536 MiB heap limit. REA reported the actual JADX engine as version 0.7.1 at pinned source revision `5844800a486d2248fa949b74c9896285f5b54de2`.

| Operation | Observed result |
|---|---|
| `inspect-android-package` | Completed decoded manifest; package `app.mihon`, version `0.21.2`, version code `38`, minimum SDK `26`, target SDK `36`; reported class count 12,524 and resource count 1,816. |
| `search-android-classes ... ReaderViewModel` | Seven matching class names, complete reported inventory coverage, no duplicate matching names. |
| `inspect-android-class ... ReaderViewModel` | Completed method/field inventory, including `pendingProgressChapter`, `pendingProgressSave`, and `progressWrites` typed as `kotlinx.coroutines.sync.MutexImpl`. |
| `inspect-android-method ... updateChapterProgressOnComplete --overload-index 0` | Available, complete **smali** body. JADX marked Java output unreliable, and REA fell back explicitly. |
| `inspect-android-class ... BackupCreator` | Completed inventory identifying the retained `backup` method and its exact DEX descriptor. |
| `inspect-android-method ... BackupCreator backup --overload-index 0` | Available, complete **Java decompilation**, with no fallback markers; 158,648 characters of generated method representation. |

### Backup result

The compiled `BackupCreator.backup` representation contains the destination stream open, gzip-backed buffered write, stream close, backup-file validation, automatic-backup timestamp update and return of the file URI. The corresponding release source expresses that sequence directly at [BackupCreator.kt:97–121](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/app/src/main/java/eu/kanade/tachiyomi/data/backup/create/BackupCreator.kt#L97-L121).

This strengthens the distinction relevant to G01: a recovery result must identify a written artifact. Current Yomikura `useScheduledBackup.ts:21–23` still accepts a returned export URL as success; `SettingsPage.tsx:287–289` still starts restore after checking only that a safety URL exists. This batch does not repair those paths. No new live-server test of Suwayomi's temporary-file retention was performed; that backend-specific conclusion remains the supplied audit's pinned-source evidence.

### Reader result

The retained completion method's smali includes checks of incognito state and the automatic tracking preference, scheduling work on the app coroutine scope, a call to `deleteChapterIfNeeded`, and duplicate-chapter update logic. The names of optimized lambda classes are not treated as proof of which provider executes. The matching source connects completion to tracking and deletion at [ReaderViewModel.kt:709](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderViewModel.kt#L709).

The matching source also skips error pages, preserves an existing read flag, flushes pending progress when changing chapter, and serializes app-scope writes through a mutex at [ReaderViewModel.kt:650–705](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderViewModel.kt#L650-L705). The APK's field inventory corroborates the presence of that state, but this pass did not recover every optimized progress function as an individual APK method. Those detailed completion/error/ordering conclusions remain source-derived.

Yomikura still computes automatic `isRead` from page index alone and swallows a failed server progress mutation after local recording (`ReaderPage.tsx:283–334`). Its cache schema still has chapter, history and download-job stores without a progress outbox. G03/G04 therefore remain separate work; G06's observer correction does not close them. Full tracking synchronization and continuous-reader ownership are also outside this batch.

## Evidence retained locally

All paths below are workspace-relative. Tooling, downloaded inputs, decompiler output and raw test artifacts remain ignored; the original failed attempts were preserved.

| Path | Contents |
|---|---|
| `.cache/parity-2026-10-23/handoff/` | Exact extracted mailbox patch, README, PR description and Astra validation logs |
| `.cache/parity-2026-10-23/` | Baseline failure/retry, 74-test result, application typecheck/build/bundle results, browser attempts and final suite log, supplementary typecheck attempts, source hashes |
| `.cache/parity-2026-10-23/browser-attempt4/offline-restart-device-cac-b6958-with-an-unavailable-backend/offline-reader-after-restart.png` | Visually inspected cached reader after closing and reopening Chrome, with the image fully visible |
| `.cache/rea/inputs/` | Official metadata, verified APK/JAR/JDK ZIP and matching release source files |
| `.cache/rea/yomikura-bundle-analysis.json` | Original sandboxed file-identity failure |
| `.cache/rea/yomikura-bundle-analysis-attempt2.json` | Complete successful production-bundle Evidence |
| `.cache/rea/yomikura-summary.json` | Small derived summary with explicit coverage/limitations |
| `.cache/rea/trace-cache.json`, `.cache/rea/trace-source-search.json` | Actual REA feature-trace Evidence |
| `.cache/rea/mihon-package.json`, `mihon-reader-classes.json`, `mihon-reader-class.json` | APK manifest/class Evidence |
| `.cache/rea/mihon-reader-completion.json`, `mihon-backup-class.json`, `mihon-backup-method.json` | Actual method/class Evidence with representation and completeness markers |

APK signatures, Android runtime/ADB, native Tauri execution and a live Suwayomi instance were not tested. No APK was installed or executed. REA's successful static analysis does not substitute for those runtime checks.

The next implementation priority remains G01 (durable backup artifacts), followed by G04 (completion/readiness) and backend-scoped durable progress synchronization (G13/G03). No architecture rewrite is required by this follow-up.
