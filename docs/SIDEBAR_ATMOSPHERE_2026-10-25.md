# Sidebar atmosphere follow-up

The user requested that the reading spirit feel immersed in the interface rather than placed on an empty area. The sidebar now uses a complete original reading-nook painting, with shared lantern/book illumination and environment shadows. Soft edge masks and a restrained palette wash blend it into the sidebar without a card border or permanent animation.

All four palettes have separate dark and light paintings. The existing visibility preference still removes the whole companion area; the reader remains free of mascots. Short-height layouts reduce the scene's height and keep utility navigation reachable. The logo, external icon and other established artwork were retained.

Validation:

- Production build and asset/script budgets passed.
- 34 focused browser checks passed, including eight palette/appearance combinations, accessibility checks, preference persistence, system mode, reduced motion, narrow navigation and 600/683px desktop-height cases.
- Browser test sources passed strict TypeScript checking.
- Real Windows/Tauri scene decoding, masks and utility navigation passed in the isolated native profile, with its backend stopped.
- Before/after and palette comparisons were visually reviewed; the root `design-qa.md` follow-up passed.

Local evidence is retained under `.cache/sidebar-atmosphere-2026-10-25/`, including supplied crops, untouched generated PNGs, optimized-asset preparation, screenshots and logs. The optimized WebP scenes are shipped under `public/identity/` and are included in the versioned offline shell.

The change adds 183,562 bytes of scene artwork. Total output is 2,933,446 bytes, including 845,500 JavaScript bytes and 737,260 identity bytes. All limits remain unchanged.
