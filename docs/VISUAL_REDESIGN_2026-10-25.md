# Visual redesign verification · 2026-10-25

The existing reading-room redesign was continued, then extended with the user's Ink & Ember identity references. Earlier implementation and reliability work was preserved. All work remains local on `codex/reading-room`.

## Result

- Official second-reference book-and-spirit logo throughout in-app branding, About, favicon/PWA metadata and native icon assets. External icons keep the fixed Ember appearance across theme changes.
- Original black reading-spirit artwork, palette-aware reading poses, neutral resting pose, and night/day sanctuary illustrations. The spirit is optional and absent from the reader.
- Ink & Ember, Sakura, Forest and Moonstone each provide coordinated dark/light surfaces, readable typography, controls, focus states, logo and mascot details. Dark/light/system appearance and preferences survive reload/restart.
- Playfair Display Variable and correctly addressed Inter Variable, both self-hosted with packaged SIL OFL licenses.
- Compact navigation/toolbars, consistently proportioned covers, useful continuation, keyboard access through long collections, clearer empty/error states and platform-appropriate download guidance.
- Native title bars follow appearance. Oversized startup windows fit inside the actual monitor work area, including native decorations and display scaling.

No backend ownership or API contracts were replaced. Suwayomi remains responsible for sources, extensions, library data and server downloads. Existing progress ownership/reset fences, backup safeguards, import constraints and reading-order policy remain intact.

## Verification

| Check | Result | Local evidence |
|---|---|---|
| Unit suite | 312 passed | `.cache/identity-2026-10-25/unit-final-candidate.log` |
| Full browser suite | 129 passed | `browser-full-final.log` |
| Reader/restoration/responsive targeted follow-up | 20 passed | `browser-reader-responsive-final.log` |
| Native unit suite | 15 passed | `native-unit.log` |
| Rust formatting / Clippy | Passed | `native-clippy.log` |
| TypeScript source and browser-spec checking | Passed | production build and strict spec check |
| Production build and version synchronization | Passed | `build-display-fit.log`, version check |
| Fresh development startup/navigation/reload | Passed; no JS page errors | `dev-smoke.log`, `dev-smoke.json` |
| Actual native theme, artwork reading and restart | Passed | `native-reader-check.json`, `native-restart-check.json` |
| Design QA | Passed | root `design-qa.md` |

Evidence names without a directory above are relative to `.cache/identity-2026-10-25/`.

The final frontend output is **2,747,992 bytes**, including **553,050 bytes** of identity assets. JavaScript is **844,719 bytes**; the largest chunk is **234,925 bytes**. The total allowance is now 3 MiB to include original artwork and display typography; the existing 1 MiB JavaScript and 350 KiB chunk limits remain unchanged, with a separate 768 KiB identity allowance.

## Native evidence

The actual Windows executable used `app.yomikura.identitycheck`, a marked configuration folder and a dedicated WebView2 profile. It did not use the installed app's personal library. At 150% scaling, its corrected outer window measured **1872×1080** against a **1920×1128** work area. Fitting saved windows and maximized/fullscreen states are preserved.

Real UI interactions selected light appearance and Sakura. Native window API inspection confirmed `light`; both the logo and spirit selected the Sakura assets. The saved native settings file contained the same preferences. After a complete close/relaunch, the theme, palette, bounded size and saved demo chapter remained available. The backend stayed stopped.

The native demo flow saved both original artwork pages, decoded the owned cached cover at 640px width and the interior page at 768px width, and used the new thumbnail navigation. No mascot elements appeared inside the reader.

## Failed attempts retained

- The first palette checks exposed insufficient muted-text contrast in three light themes and a missing DOM test environment. Values and the fixture were corrected.
- Earlier broad runs used obsolete thumbnail names and ambiguous book-link selectors after the new Continue card. Selectors now match the accessible controls while retaining restoration/geometry assertions. The clean 129-test run passed.
- The first native capture exposed off-screen geometry. Its screenshot and measured dimensions informed the bounded startup implementation; the corrected native app was rechecked and restarted.
- Early development-preview cache failures and native-build invocation attempts remain in the earlier visual evidence folder. A clean fresh development browser passed the final startup/reload check.

Raw failures, traces, screenshots, original generated assets and supplied reference copies remain under `.cache/`; they were not added to the public source set. Sources, tests, optimized original assets and licensing notices are in the local commits.

## Scope limits

This does not certify spoken screen-reader behavior, macOS/Linux runtime behavior, signed installers or live signed-in tracker providers. Automated accessibility, real Windows/WebView2 operation and existing backend workflow regressions were checked as described above. Nothing was pushed, merged, published or installed over the user's existing release.
