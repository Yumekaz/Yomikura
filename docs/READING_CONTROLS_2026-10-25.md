# Reading controls and live-source verification · 2026-10-25

This continues the existing Reading Room and Ink & Ember implementation. The scope is quieter chapter actions, consistently themed menus, clear sidebar composition and verification against real Suwayomi sources.

## Changes

- Chapter rows lead with the chapter title. Completion is a small check and “Read” in the metadata. Selection checkboxes appear only after **Select chapters**; clicking a chapter title then toggles selection. **Done** returns to reading, and successful bulk actions exit selection mode. Download actions keep their established place and behavior.
- A shared Radix-based select replaces every native select in the application source. Triggers and opened menus use the current palette in library, chapter filters, settings, source configuration, extension filters, migration, tracking and reader controls. Empty-value choices, numeric values and disabled options retain their contracts. Keyboard typeahead, scrolling, focus return and modal-contained portals are supported.
- Menu keyboard events stay inside the control. Escape closes a menu before its surrounding dialog, and reader shortcuts leave menu interaction alone. Pointer openings have a brief transition; keyboard openings and reduced-motion operation remain immediate.
- The sidebar caption now starts **6 CSS pixels below** the painted scene. All four palettes in both modes retain a clear gap, with usable short-window navigation.
- Newly discovered manga now fetch their full source details when Suwayomi reports `initialized: false`. Cached titles and chapters remain available independently. A failed detail request offers a retry and does not block reading. Requests and cache updates retain the originating backend identity.
- Light-theme offline notices and warning/error text use darker, readable semantic colors. These states were checked separately from the normal demo screens.
- Radix's MIT license is packaged in `public/licenses/` and recorded in the third-party notices.

## Automated verification

The unit suite passed **312 tests in 40 files**. Source checking, strict browser-spec checking, production builds, version synchronization and bundle limits passed. The new control cases also passed **18 repeated browser checks**, including nested Escape behavior, keyboard selection, reading-shortcut isolation, empty collection choices, all eight palette/mode combinations and narrow menus. Accessibility checks cover the opened menus and light-theme connection failures.

The clean full browser suite passed **143 tests** against frozen production output (`browser-frozen-final.log`). The final light-theme contrast refinements then passed **26 targeted browser tests** covering identity, warnings, menus, chapter selection and responsive behavior (`browser-delivery-followup.log`). The final unit rerun again passed **312 tests** (`unit-delivery.log`).

The final bundle contains **3,035,762 bytes** across 109 files, including **943,191 JavaScript bytes** and **737,260 identity bytes**. The largest JavaScript chunk is **235,344 bytes**. All existing budgets pass (`bundle-delivery.log`).

Evidence is retained privately under `.cache/reader-ux-2026-10-25/`. The full-suite preview uses a frozen copy of the production output so a later native build cannot remove assets while browser checks are running.

## Real Suwayomi and Asura Scans

Testing used an isolated, marked Suwayomi data directory, separate from the user's installed app and personal library. The server is **v2.3.2243**, JAR SHA-256 `821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5`, on Eclipse Temurin **21.0.11**. Windows system certificate trust was used for this test process; certificate verification remained enabled and system trust settings were not modified.

The official Keiyoushi signed store descriptor loaded **1,426 extensions**. Its signing fingerprint was `9add655a78e96c4ec7a53ef89dccb557cb5d767489fac5e785d671a5a75d4da2`. Asura Scans **1.6.69**, package `eu.kanade.tachiyomi.extension.en.asurascans`, installed successfully. This store and extension were configured only in the isolated test backend and are not bundled with Yomikura.

The final web journey used the actual production frontend, actual GraphQL responses and actual source images, with no API or image mocks:

| Title | Chapters in source response | Chapters exercised | Result |
|---|---:|---|---|
| Overgeared | 346 | Prologue and Chapter 1 | PASS |
| SSS-Class Suicide Hunter | 157 | Chapters 1–2 | PASS |
| The Greatest Estate Developer | 223 | Chapters 1–2 | PASS |
| Surviving The Game as a Barbarian | 166 | Chapters 1–2 | PASS |

Across these **eight chapters**, the first four page images were decoded and scrolled through. The check read progress back from Suwayomi and reopened each title at its saved page. All four titles fetched author/description/status details and were added through the app to the isolated library. No JavaScript page errors were recorded. This is a sampled reading check, not a claim that every page or every chapter was read. Raw source pages, covers, screenshots and server data remain private and are not included in Git.

## Actual Windows/WebView2 verification

The isolated Tauri executable was rebuilt from the new frontend. It retained the existing test profile and Sakura/light appearance. Native interaction verified the themed library menu, keyboard dismissal and focus return, the 6px caption gap, chapter reading state and explicit selection mode. It then connected through the normal settings flow to the real test server; all four source covers and the live chapter list rendered.

The user began using the native window during verification, so further native input was stopped. The automated eight-chapter reading result above is web evidence. The last warning-color refinements were verified in the web follow-up after this native build. Native engine installation/lifecycle, full native chapter reading, signed installers, signed-in tracking providers, macOS/Linux and spoken screen-reader behavior were not newly certified in this pass. Earlier native engine/download reliability evidence remains in the existing reliability reports.

## Retained failed attempts

- The first live-reading probe counted mounted image components rather than stable webtoon anchors. Virtualization removed those components as expected. The corrected probe addresses stable chapter/page positions and explicitly jumps to page one before exercising already-started chapters. The final four-title run passed.
- The first menu accessibility check identified a scroll region without keyboard focus. The viewport now has a labeled, focusable group; all palette checks passed.
- Two recovery tests still expected permanently visible selection checkboxes. Their navigation now explicitly enters selection mode while preserving the original reset/replay assertions.
- A broad run exposed an Escape timing problem in a migration dropdown. Explicit event boundaries fixed it; repeated menu checks passed.
- One full run was interrupted when its preview output was rebuilt. The final suite uses frozen build output. Logs, traces and screenshots from failed/interrupted attempts were retained.
- Extending the light-theme check from the warning to the full connection screen found two Ember contrast misses on tinted profile backgrounds. Darker muted/accent text fixed both; token-level contrast checks and all four connection-screen checks passed.

## Publication

Changes are saved on `codex/reading-room` in incremental safety commits. The user authorized pushing this branch after verification; the actual push result is reported in the task handoff. No merge or pull request is requested by this task. Raw live-source assets, server data and debugging artifacts are excluded from publication.
