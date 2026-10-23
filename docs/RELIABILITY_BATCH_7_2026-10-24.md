# Reliability batch 7: catalog filters and saved searches

Date: 2026-10-24, Asia/Calcutta. Starting checkpoint: `7a96b07`. The compiling catalog workflow was checkpointed as `eec348e` after 241 unit tests and ten controlled browser scenarios passed. The final verification adds a version-specific guard for a demonstrated backend Local-source limitation.

This batch implements the client portion of G18 against Suwayomi's actual supported API. Unsupported backend dispatch cases remain explicit rather than being presented as working filter choices.

## Implemented behavior

- The source catalog loads typed filter definitions from `source.filters`. Boolean, text, select, tri-state and sort controls use their provided defaults. Headers and separators keep their positions; grouped controls retain their own child indices.
- The pinned dispatcher supports one group level containing checkbox, text, select and tri-state controls. It does not apply grouped sorts or deeper groups. Those controls are displayed as unavailable and cannot enter a request or saved snapshot.
- Filter changes remain drafts until Apply. Cancelling discards the draft; Reset to defaults changes the draft. Apply includes a title typed in the main search field without discarding it. A title search can also retain an open filter draft.
- Applying filters always uses `SEARCH`, including an empty title query and choices equal to provided defaults. The backend ignores filters on `POPULAR`/`LATEST` paths. Clearing custom filters preserves the title query and restores the ordinary catalog mode where appropriate.
- Pagination carries the applied snapshot. New queries, applied filters and listing changes start at page one. Query keys include backend, source, title, filter state, listing and page; aborted/superseded responses cannot replace a later search.
- A complete request includes supported false, zero and empty-text values. A null sort is omitted because the pinned API requires a concrete selection when a sort change is supplied. Declared negative default sentinels remain valid; invented indices are rejected.
- Saved filter searches retain the source ID, a structural definition signature and complete supported choices in a versioned snapshot. Filter-only searches can be pinned. Browse links restore filters through navigation and reload; earlier query-only pins and `search` links remain compatible.
- Definitions are checked before each filtered catalog request. Changed controls/options, unsupported state, invalid input or a different source require review/reset before a positional payload is sent. Definition defaults are excluded from the structural signature so an explicitly saved valid choice survives a default change. Unsupported null/sentinel restoration still requires review.

Search snapshots use the existing settings adapter and are separate from Suwayomi library backups. Link snapshots are bounded to 64,000 characters. No backend source/extension execution was moved into the client.

## Verified backend limitations

### Group dispatch

The GraphQL input permits recursive `groupChange`, but the pinned runtime dispatcher only handles the four first-level group leaf types listed above. Metadata alone does not establish runtime support. [Pinned filter definitions and dispatcher](https://github.com/Suwayomi/Suwayomi-Server/blob/1d583ca4a718646e17a4c62d23fe8e5edccaf774/server/src/main/kotlin/suwayomi/tachidesk/graphql/types/SourceType.kt#L145-L373).

Only `SEARCH` passes filter changes into source execution. [Released catalog mutation](https://github.com/Suwayomi/Suwayomi-Server/blob/v2.3.2243/server/src/main/kotlin/suwayomi/tachidesk/graphql/mutations/SourceMutation.kt#L254-L299).

### Local source Date choice in v2.3.2243

The real built-in Local source advertises a sort with Title and Date. Direct API requests showed that changing its selected index did not change ordering; changing ascending/descending did. Two synthetic entries with opposed name/date ordering made that discrepancy observable.

Inspection of the exact verified server JAR using the installed Java 21 `javap` tool confirmed the cause. `getFilterList()` constructs an `OrderBy.Popular` filter. Local-source search dispatches by the concrete filter subclass and reads its ascending flag; it does not inspect the selection index. Date comparison is in the separate `OrderBy.Latest` branch. The date comparator itself uses `File.lastModified()`.

This is a backend Local-source search limitation, not a client payload failure. Yomikura now reads `aboutServer.version` and disables that specific advertised Date option for source `0` on v2.3.2243, with an explanation. Title sorting remains available in both directions. Other sources and other server versions retain their metadata-defined options. A saved incompatible choice is rejected before search. No backend JAR or server implementation was modified, and no page-local sorting workaround was introduced.

Raw API failures and bytecode evidence remain preserved. The guard does not claim that the backend Date behavior was repaired.

## Source map

| Concern | Source |
|---|---|
| Aliased union defaults and server-version metadata | `src/api/graphql/queries/sourceFilters.graphql`, generated SDK |
| Supported controls, validation, complete positional payloads, snapshots and known-version restriction | `src/features/browse/catalogFilters.ts` |
| Accessible draft form and unavailable choices | `CatalogFilterForm.tsx` |
| Captured backend, fresh metadata preflight, request ownership and pagination | `SourceBrowsePage.tsx` |
| Saved-link propagation and legacy query compatibility | `SourcesPage.tsx`, `sourceBrowseRoute.ts` |

The existing field styling fixes the sort selector's measured contrast failure. Manga cards now have a single explicit accessible link name. These are control fixes within the existing palette/layout, not a visual redesign.

## Verification

Raw evidence is retained under ignored `.cache/filters-2026-10-24/`.

| Check | Result | Evidence |
|---|---|---|
| Full unit suite | PASS: 242 tests, 29 files | `unit-final.log` |
| Production build / application TypeScript | PASS | `build-final.log` |
| Full production browser regression before Local-source version guard | PASS: 85 tests | `browser-full.log`, `browser-full/` |
| Final affected catalog browser scenarios | PASS: 10 tests | `browser-final.log`, `browser-final/` |
| Live Local-source contract and navigation | PASS: 3 scenarios | `live-attempt5.log`, `live-attempt5/` |
| Raw Local-source Date behavior | FAIL: backend ignores the selected field in search; client guard implemented | `live-sort-matrix.json`, `live-sort-alpha-matrix.json` |
| Actual shipped Local-source bytecode inspection | PERFORMED | `local-source.javap.log`, `local-date-comparator.javap.log` |
| Typed operation validation/code generation | PASS | `codegen-attempt3.log` |
| Browser-spec TypeScript | PASS: strict mode with existing Node declarations | `browser-typecheck-verified.log` |
| Bundle budget | PASS: 806,045 JavaScript bytes; largest chunk 230,843 bytes | `bundle-final.log` |
| Version synchronization | PASS: unchanged `1.0.25-beta.1` | Task output |

The 22 new codec tests exercise aliased defaults, exact root/group indices, every supported value type, false/zero/empty text, default-search intent, URL round trips, changed definitions, invalid values, unsupported group dispatch, declared sentinels, null-sort restoration, malformed/oversized snapshots and the narrow version guard. Existing global/source navigation regressions also pass.

The ten browser scenarios cover actual controls and request payloads, draft cancellation, typed-title preservation, pagination, pinned filter-only navigation/reload, provided defaults versus ordinary catalog mode, preflight schema-change recovery, malformed saved input, superseded responses and sources without filters. The open form has no serious/critical automated axe violations.

### Real source checks

The harness validates the existing owned server's local-source path and original synthetic title before preparing fixtures. Additional synthetic archive folders are confined to that workspace test source, carry ownership markers and are not added to the library. Earlier failed fixtures remain preserved. No personal library folders, external extensions or tracker accounts were used.

Real Chrome checks verify title ascending/descending from actual Suwayomi responses and visible card order, the version-specific unavailable Date option, pinned query-only search navigation, and older `search` links. Other filter leaf/group execution remains controlled-fixture evidence plus pinned dispatcher inspection; arbitrary third-party source behavior was not certified.

### Preserved failed attempts

- Union members' differently typed `default` fields initially conflicted under GraphQL validation. Per-type aliases were added and normalized without losing false, zero or empty values.
- A sort predicate initially inferred a nullable/non-boolean return; its Boolean guard was corrected without changing compiler settings.
- The first browser fixture accidentally held ordinary requests when both hold keys were undefined. It was corrected. Exact link checks also exposed duplicated accessible card names, which the product now fixes.
- Adding axe found a measured native-selector contrast ratio of 4.36:1 against a required 4.5:1. Existing field surface/text styling resolved it.
- The first live test incorrectly assumed Local source had no filters. Actual metadata exposed its sort. Subsequent sort experiments demonstrated the backend's ignored Date index; the source and shipped bytecode were inspected before adding the narrow guard.
- Playwright's generic disabled matcher did not recognize the native option despite its `disabled` property being true. The live test now asserts that actual property and checks the visible explanation.

No new native WebView run was performed for this batch. The native settings adapter is reused, and no Rust changes were needed. No pushes or PRs were made. Download-job bookkeeping still needs the remaining G13 identity work; other audit findings remain separate scope.
