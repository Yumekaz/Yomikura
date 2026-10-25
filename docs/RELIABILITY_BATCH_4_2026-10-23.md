# Reliability batch 4: reader settings ownership

Date: 2026-10-23, Asia/Calcutta. Starting checkpoint: `773e8fc`.

This batch addresses G17 (controls changing global defaults behind an active override) and the reader-preference portion of G13 (backend identity). Download-job identity remains outstanding; this is not a claim that all G13 acceptance criteria are complete.

## Behavior

Title settings use a canonical endpoint plus live/demo namespace and manga ID. Equal manga IDs on two servers have independent settings. A callback captures its intended backend, so a later profile change cannot redirect its save or clear action. Equivalent host/default-port/trailing-slash spelling uses the same identity; different endpoints remain distinct. Changing a server address does not automatically claim that its data is the same database.

All title controls receive their effective values and scoped actions from the reader: direction, fit, spread, filters, cropping, page transition and download-ahead. With “Remember for this manga” enabled, edits update that title. With inheritance enabled, edits use global defaults. Partial image-filter changes merge with existing title filters. False and zero remain valid explicit overrides. Clearing a title override removes only the selected backend's entry and returns the reader to inherited values.

Older numeric entries do not contain enough information to identify their original server. They remain preserved, without being applied to arbitrary profiles. Settings → Reader displays a recovery card only when such entries exist and have not been associated. The user selects the owning server and confirms the displayed destination. The copy preserves the original entries and gives newer scoped values precedence. A profile change while confirmation is pending cancels the association; the same legacy set is not silently applied again to another backend.

The settings storage mechanism remains the existing browser local storage / Tauri settings-file adapter. These values are not included in Suwayomi library backups.

## Source map

| Concern | Implementation |
|---|---|
| Identity and filter merge helpers | `src/stores/mangaReaderSettings.ts` |
| Scoped writes, clears, recovery and persistence | `src/stores/useSettingsStore.ts` |
| Effective values and actions | `src/features/reader/ReaderPage.tsx`, `ReaderOverlay.tsx` |
| Earlier-settings recovery | `src/components/settings/ReaderSettingsPanel.tsx` |
| Unit contracts | `src/stores/mangaReaderSettings.test.ts` |
| Browser integration | `tests/e2e/reader-settings.spec.ts` |

## Verification

Raw logs, screenshots and traces are preserved in ignored `.cache/reader-settings-2026-10-23/`.

| Check | Result | Evidence |
|---|---|---|
| Full unit suite | PASS: 147 tests, 24 files | `unit-full.log` |
| Production build / application TypeScript | PASS | `build-attempt1.log`, final watcher-config validation in `build-final.log` |
| Full production browser suite | PASS: 54 tests | `browser-full.log`, `browser-full/` |
| Browser-spec TypeScript | PASS | `browser-typecheck-verified.log` |
| Bundle budget | PASS: 759,870 JavaScript bytes; largest chunk 230,746 bytes | `bundle.log` |
| Real-server regressions after watcher correction | PASS: 11 workflows | `live-regressions-fixed.log`, `live-regressions-fixed/` |

Nine unit tests cover backend/demo collisions, URL normalization, captured callbacks, scoped clearing, filter merging, persistence, preserving unowned records, confirmed association with newer-edit precedence, stale destination rejection and reset. The two browser scenarios exercise the actual settings controls, rendered image filters, two profiles with overlapping IDs, reload, clearing one override without affecting the other, cancelling legacy recovery, confirming the displayed server, and retaining the original legacy record. Download-ahead and transition edits also remain separate from the global defaults.

The other 52 browser checks cover backups, cached reading/restart, progress recovery/conflicts, chapter actions, reader positioning/continuity/auto-scroll, existing UI and automated accessibility checks. API fixtures are used in this production suite; real-server evidence is identified separately.

## Development-server correction

The first real-server regression attempt produced 7 passes and 4 failures while Vite repeatedly reloaded the app. Its log shows reloads for the trace recorder's generated `.cache/.../resources/*.html` files, including repeated identical resource names. The failed screenshots show the route loading placeholder. Those failures and traces remain preserved in `live-regressions.log` and `live-regressions/`.

`vite.config.ts` now excludes generated evidence, local package stores, reference inspection output and native build output from file watching. Dependency scanning starts at the project's `index.html`. After restarting the owned Vite process, trace creation no longer triggers those reloads. The real-server suite is rerun with the correction. This change does not alter production application behavior or suppress source-file watching.

No new native WebView run was performed for this batch. Browser persistence and the shared frontend behavior were verified; Tauri settings-file persistence uses the existing adapter. No dependency changes, version changes, pushes or PRs were made.
