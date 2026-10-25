# Yomikura visual implementation QA · 2026-10-25

final result: passed

## Source and implementation

- Source visual truth: the two user-supplied identity boards, retained unchanged as `.cache/identity-2026-10-25/reference-1.png` and `reference-2.png`. The second board supplies the official book-and-spirit mark. Both source boards are 1448×1086.
- The user explicitly requested creative interpretation and continuation of the existing redesign. This is a design-language comparison, rather than a pixel-copy claim about the boards' embedded example applications.
- Browser implementation: 1440×1024 CSS pixels, device scale factor 1, matched dark/light library and settings states. Screens are under `.cache/identity-2026-10-25/screens/`.
- Full-view comparison: `qa-comparison-both-references.png`. It contains both boards, the actual Ember library, Sakura light library, Forest light Appearance screen and light onboarding in one combined comparison input. Tiles are normalized to 720×540 with aspect-preserving containment; implementation screenshots remain available at original resolution.
- Focused inspection: individual `logo-*.webp`, `spirit-*.webp`, original-resolution library/settings captures and actual native window captures. Typography, logo silhouette, cover proportions, control spacing, focus and image edges were checked at readable scale.
- Additional collection evidence: `.cache/visual-upgrade-2026-10-24/screens/library-{0,1,20}-1440.png`, and the 200-book captures at 390, 768, 1024, 1280 and 1440 CSS pixels. Two original cover families are deliberately repeated in these layout fixtures; they are not presented as a real 200-book catalog.

## Findings and comparison history

1. **[P2, resolved] Small typography and excessive caption spacing.** The first reading-room comparison made book captions noticeably smaller than the intended hierarchy. Book titles became 14px, secondary captions 12px, caption spacing tightened, and virtual row measurements changed with the visible geometry. The loaded Inter family name was corrected to `Inter Variable`; display typography now uses the supplied Playfair direction. Post-fix evidence: the current original-resolution library captures.
2. **[P2, resolved] Three light-palette secondary text values were below the intended 4.5:1 contrast threshold.** Sakura, Forest and Moonstone muted colors were deepened. All eight token combinations now pass the numerical checks; actual library/settings states also passed serious/critical automated WCAG checks. Evidence: `palette-contrast-final.log`, `unit-final-candidate.log`, and the final browser log.
3. **[P2, resolved] Native startup could extend beyond the scaled monitor work area.** The real Windows app initially exceeded the usable display. Startup now bounds decorated physical dimensions with display-scaled margins, while preserving fitting, maximized and fullscreen windows. Secondary setup choices were compacted, and the spirit scales down on shorter displays. At 150% scaling, the corrected outer window is 1872×1080 within a 1920×1128 work area. Evidence: `native-welcome-before-fit.png`, `native-welcome-fitted.png`, `native-fitted-geometry.json`, and `native-restart-check.json`.
4. **[P2, resolved] Website-only download instructions appeared in the desktop empty state.** The shared screen now gives platform-appropriate guidance and a useful Choose a book action. Confirmed in the actual Windows app before saving a demo chapter. Evidence: `native-downloads-empty.png` and `native-reader-check.json`.

No actionable P0/P1/P2 differences remain in this batch.

## Required fidelity surfaces

- **Typography:** Playfair/Inter family names and actual self-hosted files verified; display hierarchy, metadata wrapping and truncated book titles reviewed. No decorative serif treatment on dense controls.
- **Spacing/layout:** compact navigation, measured 2:3 shelves, visible primary reading action, restrained borders and responsive control wrapping. Long shelves reach the final book; keyboard focus can reach beyond initially virtualized rows.
- **Colors/tokens:** complete coordinated palettes, independent appearance mode, native frame synchronization and high-contrast overrides. Semantic failure styling remains distinct from palette selection.
- **Image quality:** official mark recreated from the second reference, true-alpha spirit poses, palette variants and separate night/day paintings. Minor generated edge variation between palette assets is accepted at icon display scale. Manga artwork is not recolored by the theme; no source-board comic covers or franchise assets ship in the app.
- **Copy/content:** normal reading screens use reader-facing language. Technical details are in connection settings or disclosures. Demo content is explicitly separate. No unsupported ratings, percentages, Community or Goals workflows were invented.

## Interactions and coverage

- 129 browser tests passed in the clean final run, including the original backup, offline restart, progress recovery, profile, reader continuity, migration, tracking-fixture and source-filter checks.
- All palettes in both modes, theme persistence, spirit visibility, system appearance changes, reduced motion, narrow navigation and a 200%-equivalent viewport were exercised. The enlarged viewport is an emulation, not a claim of physical OS zoom coverage.
- Actual Windows/WebView2 checks confirmed native first launch, logo, light title bar, palette-aware spirit/logo, verified demo downloads, owned cached page decoding, thumbnail navigation and restoration of Sakura/light preferences after app restart. The native backend remained stopped throughout this demo-only check.
- Fresh development startup, navigation, palette selection and reload passed without JavaScript page errors. Expected connection-refusal conditions in offline fixtures are not counted as application runtime failures.

## Accepted differences and limits

- The reference boards contain illustrative books and extra destinations. The implementation keeps Yomikura's actual supported information architecture and original demo artwork.
- Rich atmosphere is concentrated in first launch and quiet states; it does not compete with comic pages or add permanent idle motion.
- Spoken screen-reader certification, macOS/Linux execution, signed installer publication and signed-in external provider checks were not performed in this visual pass.

## Implementation checklist

- [x] Continue previous layouts and preserve functionality.
- [x] Official second-reference logo and fixed external icon.
- [x] Optional reading spirit and original atmosphere assets.
- [x] Four coordinated dark/light palettes and persisted settings.
- [x] Responsive, keyboard, reduced-motion and accessibility checks.
- [x] Actual native fitting, appearance, reading and restart checks.
- [x] Retain failed attempts and source evidence locally.

**Follow-up polish:** no additional refinement is required for this handoff.

## Sidebar atmosphere follow-up · 2026-10-25

The user subsequently requested a more integrated mascot treatment. The target and prior implementation are retained as `.cache/sidebar-atmosphere-2026-10-25/reference-target.png` and `reference-before.png`.

- The floating sidebar cutout was replaced with a coherent painted reading nook: black spirit, books, lantern and shared reflected light. Eight palette/mode assets use soft peripheral colors, with intersecting runtime masks feathering them into the actual sidebar surface.
- Full matched comparison: `screens/sidebar-before-after.png` under that evidence folder. Both halves are 216×464 crops from actual 1440×1024, scale-factor-1 browser captures, using the same sidebar region and theme. Left is the earlier implementation; right is the revised scene.
- Palette comparison: `screens/sidebar-palette-comparison.png`, four dark treatments over their corresponding four light treatments. Inspected together at readable scale for silhouette, lighting, seams, caption contrast and navigation spacing.
- 34 focused browser checks passed, covering all palette/mode combinations, automated accessibility, visibility preference, system appearance, reduced motion, desktop workflows and short 600/683px navigation layouts. Production build, strict browser-spec checking and bundle checks passed.
- The actual isolated Tauri window decoded the Sakura/light scene, applied the mask and retained visible Library/History/Settings navigation at the laptop's scaled native viewport. Its backend remained stopped. Evidence: `native-scene-check.json` and `screens/native-sakura-light.png`.
- Current frontend output: 2,933,446 bytes; JavaScript 845,500 bytes; identity artwork 737,260 bytes. Existing budgets pass.

No actionable P0/P1/P2 issue remains in this follow-up. The earlier full regression baseline remains documented above; it was not represented as a newly rerun full suite for this presentation-only change.

## Reading controls and live-source follow-up · 2026-10-25

- Default chapter rows now lead with the title and quiet read metadata. Checkboxes appear only in an explicit selection mode; title taps select there, and Done returns to reading. Native and browser interaction were checked.
- One accessible themed select now supplies triggers and opened menus throughout the application. Keyboard typeahead, empty choices, numeric values, modal portals, focus return, nested Escape and reader-key isolation were exercised. Palette-aware menus replace OS-blue dropdowns.
- The caption sits 6px below the scene in all eight palette/mode combinations. Native Sakura/light inspection also measured 6px and retained visible navigation.
- Real Suwayomi/Asura testing covered four titles and eight chapters, decoded images, source details, backend progress and reopening. The actual Windows preview displayed the same four-title live library and chapter list. Copyrighted source artwork remains outside the public asset set.
- Full browser suite: **143 passed** on frozen production output. Final warning/profile contrast refinements: **26 targeted browser checks passed** afterward. Final unit suite: **312 passed**. Source/spec checking, production build, version and bundle gates passed.
- Final native evidence: `.cache/reader-ux-2026-10-25/native-light-menu.png`, `native-selection.json`, `native-live-chapters.png`. The last warning-color adjustments were checked in the web follow-up after this native build. The user took over the native window, so no additional native input was sent.
- Failed checks and interrupted runs are retained and explained in `docs/READING_CONTROLS_2026-10-25.md`. Spoken screen-reader certification, a signed installer and signed-in providers remain outside this pass.
