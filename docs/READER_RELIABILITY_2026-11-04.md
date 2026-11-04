# Reader reliability and beta verification

**Current result:** beta.5 passed its complete tagged release build, package/signature verification and exact installed Windows checks, including saved reading across an outage and app restart. The original library was restored unchanged. The [public beta prerelease](https://github.com/Yumekaz/Yomikura/releases/tag/v1.0.25-beta.5) was published on 4 November 2026 after owner approval; v1.0.24 remains stable. The earlier candidate evidence below is retained separately from the final beta.5 results.

This follow-up addresses the reported reader ending, shared zoom, source-site action and sideways comic-content movement. It continues the existing Ink & Ember interface and React/Tauri/Suwayomi architecture. The earlier [reading-workflow report](READING_WORKFLOWS_2026-11-03.md) remains the baseline for automatic offline access, extension notices, history, duplicate review and the browser setup guide; its earlier installer does not establish verification of these subsequent reader changes.

## Behavior and implementation

| Before | After | Why |
| --- | --- | --- |
| A reader could reach the last known image without an explicit, useful ending. | The chapter-end panel identifies the chapter, shows **Finished** only after successful reading, and says **There’s no next chapter** when the confirmed library list ends there. | Reaching the currently listed end should be understandable without implying the series is permanently complete. |
| An absent eligible next chapter could mean a filter, an outage or an incomplete request. | Separate messages describe filtered continuation, the end of a saved list, a failed check and a loading list. | A missing next link is not proof that the source has no later chapter. |
| Image zoom was local to the rendered page and inconsistent in vertical reading. | One reading-session scale applies to paged images, the webtoon strip and images mounted later. Toolbar controls, `+`/`-`/`0`, Ctrl-wheel and two-touch pinch use that shared scale. | Moving to another page should retain the reader’s chosen magnification. |
| Zoom/pan could interfere with position or completion detection. | Focal-point anchoring and gesture fences keep layout changes from immediately writing artificial progress. Measured virtualized placeholders scale with the images. | Resizing artwork is not the same as reading past it. |
| A source link relied on WebView `target=_blank` behavior. | Desktop invokes the operating system’s HTTP(S) browser association; browser use keeps its separate-tab link. Errors produce readable recovery feedback. | The same visible control must work in both environments. |
| Refresh could report success without a confirmed refreshed book. | The source refresh must return the requested manga ID before success is announced and relevant caches are invalidated. | A failed or null response must not look successful. |
| Long titles and horizontal interaction could push comic details sideways. | Detail content has bounded flex sizing, wrapping titles, disabled cover-image dragging and horizontal overscroll containment. | Normal detail browsing should stay inside the application window. |
| Light-theme chapter-end text inherited dark ink while the reader canvas stayed black. | The ending has its own palette-aware surface; four light palettes receive a dedicated contrast check. | The ending, chapter title and recovery actions must remain readable in either appearance. |

The zoom range is 50–400%, or 100–400% when **Disable zoom out** is enabled. Double-click/double-tap returns either magnification direction to 100%; at 100% it toggles to 200% when double-tap zoom is enabled. The percentage control also resets directly. Vertical touch scrolling remains available at or below 100%, with bounded artwork panning above it. Physical touch hardware still needs separate verification.

The reader rechecks the backend’s known chapter list on focus, during a bounded interval at the tail and through **Check chapter list**. A later eligible chapter replaces the caught-up message without resetting the current reading position. This recheck reads Suwayomi’s list; it does not promise that the source itself has published or already supplied every new chapter. **Refresh book and chapters** on comic details requests the source refresh through Suwayomi. Source execution, networking and authoritative library/chapter data remain backend-owned.

The end panel reserves the measured visible footer area. Repeated scrolling cannot move the entire meaningful ending above a trailing blank viewport. Loading or failed final images remain distinct from completed reading, including the existing split-page and reread safeguards. Failed thumbnail requests display a page-number fallback instead of a broken-image icon.

Source URLs are validated in both layers. Native launching accepts HTTP(S), rejects embedded credentials and hidden control characters, and passes the URL directly to the platform launcher without constructing a command shell. Refresh does not issue chapter read/bookmark mutations.

Implementation entry points:

- [Shared zoom and gestures](../src/features/reader/useReaderZoom.ts), [image geometry](../src/features/reader/useImageLayout.ts), [virtualized webtoon pages](../src/features/reader/WebtoonPage.tsx).
- [Reader state and progress ownership](../src/features/reader/ReaderPage.tsx), [visible image navigation](../src/features/reader/useWebtoonNavigation.ts), [chapter boundary](../src/features/reader/ChapterEndBoundary.tsx).
- [End-state policy](../src/features/reader/readerEndState.ts), [chapter-end interface](../src/features/reader/ReaderEndStatus.tsx), [complete reading sequence](../src/features/reader/readingSequence.ts).
- [Book actions](../src/features/manga/bookActions.ts), [comic details](../src/features/manga/MangaDetailPage.tsx), [native browser handoff](../src-tauri/src/external_links.rs), [layout containment](../src/styles.css).

## Regression coverage

| Area | Evidence |
| --- | --- |
| Shared webtoon zoom | Every mounted page changes scale; later page navigation retains it; reset works from above and below 100%; the active cursor remains stable. |
| Paged zoom and pan | Page navigation retains scale; Ctrl-wheel changes it; panning does not move the document outside the viewport. |
| Touch interactions | Chromium touch events exercise pinch and double-tap; component tests protect one-finger vertical scrolling and prevent a simultaneous pinch from adding drag scrolling. |
| Chapter endings | A confirmed latest chapter shows its ending in the viewport; discovery of another chapter replaces the message; filtered continuation and failed images never become a false caught-up/Finished announcement. |
| Readiness and offline continuity | Progress waits for decoded pages. Moving backward through an actually saved page during a simulated server outage preserves completion and records the new position durably. |
| Source actions | Refresh confirms metadata, preserves read/bookmark state and reports a null response as failure. The web control opens a separate tab with the original safe URL. Native URL validation rejects non-web and credential-bearing links. |
| Horizontal containment | Long/unbroken titles at 1100px and 390px, horizontal wheel input and cover drags retain zero document horizontal offset while vertical scrolling and toolbar access remain usable. |
| Installer ownership | Creation-time-verified process ancestry and retained process handles prevent a recycled PID from being counted or stopped as Yomikura’s child. Synthetic reuse checks retain the graceful-shutdown gate. |

Browser specifications: [zoom](../tests/e2e/reader-zoom.spec.ts), [endings](../tests/e2e/reader-end.spec.ts), [continuity](../tests/e2e/reader-continuity.spec.ts), [source actions](../tests/e2e/source-actions.spec.ts), [detail overflow](../tests/e2e/detail-overflow.spec.ts). Unit checks cover the shared zoom, gesture interaction, end-state model/component, reading-sequence pagination and source-action contracts. Sanitized visual-review fixtures use the project’s original demo artwork rather than third-party comics or private screenshots.

## GitHub verification

Reader/palette baseline commit: `8d42858731c574e5ab602031e6102ee2d67d5fee` on `codex/reading-room`. All three jobs passed in [Verify run 41771793948](https://github.com/Yumekaz/Yomikura/actions/runs/41771793948), following the successful [reader baseline run 41767717025](https://github.com/Yumekaz/Yomikura/actions/runs/41767717025) at `724ebfc`. All compilation and full browser/native suites ran on GitHub; no heavy local build was required.

| Gate | Recorded result |
| --- | --- |
| Windows native compilation, formatting and Clippy | PASS |
| Native Rust unit tests | PASS: 27 tests |
| Windows installer lifecycle and verified private runtime | PASS: installed application and local Suwayomi launched; owned children exited cleanly; uninstall checks passed |
| Real Suwayomi identity, replacement and restore checks | PASS: two isolated libraries reused an endpoint without adopting stale work; verified restore and marker renewal retained the origin boundaries |
| Frontend typechecking and unit tests | PASS: 544 tests across 80 files |
| Release-artifact tooling tests and synchronized versions | PASS: 15 artifact-tooling tests and version synchronization |
| Production dependency audit, build and bundle budget | PASS: 3,224,670 total bytes; 1,130,289 JavaScript bytes; 737,260 identity-artwork bytes; largest JavaScript chunk 332,839 bytes |
| Browser interaction suite | PASS: 255 tests, including the four light-palette contrast cases, plus separate chapter-menu and offline-continuity checks |
| Tagged packages and checksum/signature verification | Completed separately for the final beta.5 assets below; these earlier branch artifacts are baseline evidence only |

Run 41771793948 also covers the palette-aware ending surface, tracker rows using the built-in `Link2` icon instead of a broken remote favicon, and compilation of the desktop single-instance callback that unminimizes the window before showing and focusing it. Actual shortcut restoration and the corrected light ending were subsequently checked in the exact final installed package below.

Earlier failed attempts remain retained privately. They exposed ambiguous test locators, a mutable DOM-ref type diagnostic, a small bundle overrun, footer-obscured completion assumptions and an offline fixture that had not actually saved the remounted image bytes. The final fixture explicitly seeds the saved chapter and requires a decoded `blob:` image before checking durable offline progress; it retains the completion/position assertions. The installer harness also stopped relying on PID-only ancestry after an unrelated compiler helper was misidentified. These earlier failures are not counted as successful checks.

## Newcomer journey

A separate, initially empty real Suwayomi library was connected through the browser guide’s own form. The existing profile was retained. The empty library offered discovery, the built-in Local source exposed an original-art CBZ, **Add to library** opened category assignment, and saving produced **In Library**. Both image pages rendered; reloading restored page 2 of 2. A direct server read confirmed its zero-based position (`lastPageRead: 1`) without falsely marking the chapter complete.

This is a real Local-archive first-reading journey using an existing pinned private Java runtime. It is not evidence of a fresh third-party extension installation or an untouched Windows installation. The helper’s optional WebUI initially fell back to its bundled UI after a certificate validation failure; no TLS validation was disabled. Production native startup uses the Windows trust store. Fresh runtime download/integrity and launch are covered separately by Windows CI.

## Installed candidate and release handoff

The installed branch candidate came from `c635bb578112b51d7e8e22fcc55d601f49d65297`, before the final test-fixture correction. Its Windows installer job passed in [run 41688782319](https://github.com/Yumekaz/Yomikura/actions/runs/41688782319); that earlier run’s Frontend job failed and is not counted as a passing full suite. The later successful runs above supply complete branch verification.

GitHub artifact `13257532221` ZIP SHA-256:

```text
3f4e016f84d4cb7ee2076a690af0185abf487605f21c5271549d469d23de00f0
```

`Yomikura_1.0.25-beta.4_x64-setup.exe` is 6,419,277 bytes, SHA-256:

```text
ee9d9dd72da11b865aba43b727e5cad45b7e25e087224bbcc542c499458484ea
```

The archive matched GitHub’s recorded digest before extraction and execution. Normal Windows Explorer installation selected **Add/Reinstall components** and completed in place.

| Installed check | Observed result |
| --- | --- |
| Original library preservation | PASS: the existing one-book library and its Chapter 1 / Page 3 of 19 resume position remained available after replacement. |
| Source-site control | PASS: the actual source URL opened the expected comic page in Chrome, outside the Tauri window. |
| Source refresh | PASS: refresh completed and the displayed live metadata changed. A before/after backend JSON comparison found all 223 chapters’ read, bookmark and page-position state unchanged. |
| Shared native zoom/reset | PASS: the isolated real Local chapter rendered at 120%, retained that scale when changing pages, and returned to 100% on double-click from both 120% and 83%. |
| Final-chapter state | PASS for behavior: the loaded final page produced **Finished** and **There’s no next chapter** above the controls. The server confirmed page 2 of 2 and read state. |
| Light-mode presentation | FAIL in this earlier branch installer: the ending’s title and actions were too dark against the black canvas. The subsequent fix passed contrast checks in all four light palettes and its final Windows visual retest below. |

These are branch-candidate observations. They do not substitute for installing and checking the exact final release asset, particularly the subsequent light-mode surface, icon and minimized-window changes. The original profile and its resume position were restored after the isolated reader checks; a backend comparison confirmed all 223 original chapter states were unchanged after QA.

Current sanitized original-art views: [reader zoom](images/beta.4/reader-zoom.png), [reader ending](images/beta.4/reader-end.png) and [browser setup guide](images/beta.4/browser-setup.png). The updated reader views come from passing run 41771793948. Its isolated contrast-fixture screenshots show [Ember](images/beta.4/reader-end-light-ember.png), [Sakura](images/beta.4/reader-end-light-sakura.png), [Forest](images/beta.4/reader-end-light-forest.png) and [Moonstone](images/beta.4/reader-end-light-moonstone.png). The fixture’s transient pending-progress indicator is captured during test synchronization, not presented as a released library or live source session.

The beta.4 tag at `9db309259c95c66f8d9733e2cbfb6ea566ad183c` passed release preflight (544 unit, 255 browser and 15 artifact tests) and its Windows installer smoke in [run 41773414567](https://github.com/Yumekaz/Yomikura/actions/runs/41773414567). Platform packaging was deliberately cancelled after additional installed QA found that other external help links shared the original WebView handoff problem and the server-update notice had insufficient light-mode contrast. The original tag is retained; no beta.4 release was published.

## Beta.5 follow-up

All desktop HTTP(S) external links now use one validated browser handoff, covering sources, help, provider links and update releases. Internal routes and already-handled clicks keep their behavior. Pending clicks are deduplicated, keyboard and middle clicks are supported, and launch failures show recovery feedback. Website links keep their normal browser behavior. [Implementation and interaction tests](../src/utils/externalNavigation.ts) are shared by the app shell instead of special-casing only comic details.

The server-update notice now uses the palette's text and surface, stays still rather than pulsing, and explains that Yomikura's managed engine updates through app releases. Readers managing their own server are directed to its release notes and a backup before upgrading. Four light-palette contrast cases cover this actual status, including its release link.

Current beta.5 views from its successful branch run: [reader zoom](images/beta.5/reader-zoom.png), [reader ending](images/beta.5/reader-end.png) and [light server-update notice](images/beta.5/server-update-light.png). These contain only original demo artwork or isolated fixtures.

Beta.5 application/test commit `df86c72c944dcba5e86c3c9b38385c46e86158f3` passed all three jobs in [Verify run 41777921993](https://github.com/Yumekaz/Yomikura/actions/runs/41777921993): **555 unit tests, 259 browser tests, 27 native tests and 15 artifact-tooling tests**, including installer lifecycle, verified runtime and real-library replacement/restore checks. The four server-update light-palette contrast cases passed. Production output is 3,224,830 total bytes, 1,130,449 JavaScript bytes and a largest chunk of 334,097 bytes; the existing budgets and artwork size were retained. One earlier beta.5 run exceeded the JavaScript limit by 444 bytes; sharing repeated help-link rendering resolved that without removing any destination or relaxing the limit.

## Final beta.5 packages and installed verification

Tag `v1.0.25-beta.5` points to `0413cf97fbbf918dbce89c9d56cc5dee5543070d`. Its application/test tree is identical to the verified `df86c72` commit; the intervening changes document the handoff. All six jobs passed in [release run 41779186550](https://github.com/Yumekaz/Yomikura/actions/runs/41779186550): release preflight, Windows installer smoke, Windows/macOS/Linux packaging and final artifact verification. Preflight repeated the 555 unit and 259 browser tests, dependency audit, build budget and 15 artifact-tooling tests. The installer gate repeated 27 native tests and verified the production private runtime and lifecycle.

All uploaded packages matched the original platform-build manifests. The finalizer verified **five updater payload signatures and eight target mappings** against the configured public key, then attached the three platform checksum manifests. Actual packages are Windows x64 NSIS, macOS Apple-silicon DMG/app archive, and Linux x86_64 AppImage/DEB/RPM. No Intel Mac package or interactive macOS/Linux coverage is claimed.

The exact Windows release download, `Yomikura_1.0.25-beta.5_x64-setup.exe`, is **6,418,045 bytes** with SHA-256:

```text
a8010d11da690ea16376da20c0446f553062e9b8e8aaaddf37a03731fc40d1a9
```

The downloaded file matched both the original Windows checksum manifest and GitHub asset digest before execution. Its attached signature also matched the updater metadata. Normal Explorer installation selected **Do not uninstall**, retained the usual destination and created the desktop shortcut. About displayed `1.0.25-beta.5`.

| Final installed Windows check | Result |
| --- | --- |
| Upgrade and original library | PASS: the original library, saved download and Chapter 1 / Page 3 of 19 resume position remained. All 223 original chapters' read, bookmark and page-position values matched the pre-upgrade baseline after the complete QA session. |
| Pre-upgrade backup | PASS: a new retained backup matched its manifest checksum and decompressed with a valid gzip checksum. The same archive remained byte-identical after installation. This was an integrity check, not a restore over the user's library. |
| Source and help links | PASS: primary clicks opened the actual comic source, official server release and existing Troubleshooting document in Chrome outside the app. Source refresh left the original chapter-state baseline unchanged. |
| Details containment | PASS: dragging the cover and applying horizontal wheel input left comic content inside the window. The broader browser regression checks also cover long titles at 1100px and 390px. |
| Light-mode presentation | PASS: the server-update notice and chapter-ending title, status and actions remained readable in the final installed light theme. **Finished** and **There's no next chapter** were visible above the footer. |
| Shortcut and restart | PASS: normal shortcut launch worked; opening it again restored the same minimized app window. |
| Saved reading and zoom | PASS: both original-art saved pages rendered while their test server refused connections. A 120% scale followed page selection; double-click reset from both 120% and 83% to 100%. |
| Offline app restart | PASS: the retained library opened automatically without a **Continue offline** choice. Covers, comic details and the saved chapter remained accessible. The reader resumed at page 1 of 2 and retained its pending progress record. |
| Reconnection and progress | PASS: reconnect cleared the pending record. The real isolated server changed its zero-based `lastPageRead` from 1 to 0 while `read` stayed true. Reading to the end afterwards showed the confirmed last-chapter panel. |
| Profile restoration | PASS: the original on-device profile was restored, became reachable and retained its complete chapter-state baseline. Only the separately identified QA helper was stopped; its data and failed attempts remain private. |

The outage test stopped a separately created backend after matching its saved process identity; the QA endpoint was confirmed unavailable while the original library remained reachable. The laptop's internet connection was not disabled. This establishes saved reading during server unavailability; it does not add a physical network-disconnection or upstream crash-durability claim.

The clean GitHub installer smoke recorded 19.91 seconds to backend readiness and 920.5 MB combined working set across its verified process set. These are runner measurements, not laptop performance guarantees.

The release was published as a **public prerelease** after owner approval. The latest stable release and ordinary updater/download routing remain `v1.0.24`; no main-branch merge or public website deployment accompanied this work. [Release notes](releases/v1.0.25-beta.5.md) include installation steps and the tested limitations.

Post-publication checks used no GitHub credentials: all **15 public asset links** returned HTTP 200. A fresh Windows installer download matched the SHA-256 above. The installer, its signature, Windows checksum manifest and updater metadata were byte-identical to the reviewed draft files; the updater metadata retained all eight target mappings. GitHub's public latest-stable endpoint still returned the existing v1.0.24 release.

## Scope and limits

Mihon’s private reference images informed the intended reading behavior. The existing [source and static REA evidence](MIHON_REFERENCE_IMPLEMENTATION.md) remains separately pinned; this follow-up does not claim a fresh APK/REA run or Android runtime session. The implementation is Yomikura’s desktop/web adaptation, with no copied Mihon artwork or proprietary extension content and no added runtime dependency for the reader fixes.

Coverage is GitHub Chromium/Windows runners, the real isolated library journey and the installed checks explicitly recorded above. Physical pinch hardware, spoken screen-reader output, signed-in tracker providers, interactive Linux/macOS behavior and a forward stable automatic-update installation remain separate evidence gaps. Unsaved pages still require the backend/source connection; retained metadata is not a backup. Both private image folders, library data and raw failed attempts remain excluded from Git. Existing [library identity limitations](LIBRARY_IDENTITY_2026-11-02.md) continue to apply.
