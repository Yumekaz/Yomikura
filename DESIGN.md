# Yomikura · The reading room

An ink-and-paper home for a personal comic collection. Artwork leads; reading is the primary action. The 2026-10-25 identity direction adds the user's official book-and-spirit mark, black reading spirit and Ink & Ember atmosphere to the reading-room layouts already implemented.

## Visual direction

- Four complete palettes: Ink & Ember, Sakura, Forest and Moonstone. Each has paired dark/light surfaces, text, action, focus and border colors. Canonical values live in `src/theme/palettes.ts`.
- Ember uses ink `#110f0d`, charcoal `#1a1713`, parchment text and an accessible deep vermilion primary action. Light themes use coordinated paper colors, rather than inverted dark screenshots.
- Playfair Display Variable for wordmarks and principal headings; Inter Variable for controls, book titles and metadata. Both are self-hosted, with packaged SIL OFL notices.
- Page titles 32–36px; book titles 14px; supporting information 11–13px. Keep display type away from dense controls.
- Desktop sidebar 216px. Content padding 20–48px, a 24px bookshelf gap and true 2:3 covers. The same measured column count controls rendering and virtualization.
- Small 6–8px control radii, 10–12px surface radii. Minimal elevation; no decorative grid, glow or permanent activity animation.

## Product rules

- Library, Discover, Updates and Downloads are the main destinations. History and Settings are secondary. All six remain reachable on narrow screens.
- Library search and Add books are visible immediately. Actual recent unfinished activity earns a Continue reading card; a new library gets an actionable empty state.
- Titles sit below covers. Never darken readable artwork to communicate completion. Unread counts remain discreet and readable.
- Collections, availability, sorting, view selection, refresh and bulk selection retain their existing behavior.
- Ready / Connecting / Reading offline describe everyday connection states. Server addresses, runtimes, ports and diagnostic errors belong in connection settings or explicit Details disclosures.
- The reading spirit is decorative, palette-aware and optional. It accompanies the desktop shelf and quiet states, becomes smaller on shorter displays, and stays outside the reader.
- In-app logos adapt to palettes. The packaged external desktop/PWA icon keeps the fixed Ember appearance. Native title bars follow dark/light/system appearance.
- Appearance leads Settings. Desktop setup recommends a managed device library, with folder and portable choices available. Web setup offers a clearly identified demo and an optional existing-library connection.
- Downloads distinguish copies on this device from copies on the connected server. Never imply that server availability guarantees device availability.
- Reader controls stay quiet and preserve the existing chapter ownership, restoration and progress fences.

## Motion and access

Use brief, exact-property feedback: 120–180ms controls, subtle cover lift on fine-pointer hover, no navigation entrance animation. Support reduced motion, light/dark/system themes, high contrast, visible keyboard focus, labelled controls and keyboard access through a long bookshelf.

Native startup preserves usable saved geometry and maximized/fullscreen states. If a window exceeds its monitor's work area, fit its decorated physical size inside that work area with a scaled margin. Keep the complete first-run controls reachable on smaller displays.

## Original demo artwork

`public/demo/` contains original generated cover and wordless sample-page artwork for **Moonlit Courier** and **The Paper Garden**. These fictional stories replace unrelated external demo photographs; they are never substituted for a user's metadata or covers. Generated originals and prompts are retained in the local visual-review evidence folder. WebP derivatives are sized for their display slots. Demo artwork is included in the versioned offline application shell.

## Validation target

The earlier bookshelf reference is retained as `.cache/visual-upgrade-2026-10-24/library-reference.png`. The user's two later identity boards in `.cache/identity-2026-10-25/reference-{1,2}.png` establish the current creative direction; the second supplies the official logo. They are creative references, not pixel-copy templates.

Retain actual supported filters and display real activity rather than invented progress, ratings, book totals or unsupported sort choices. Do not invent Community, Goals or other features shown only in reference artwork. Review desktop, mobile, sparse/long collections, empty/search states, all palettes, keyboard access, native scaling and actual reading workflows. See `design-qa.md` and `docs/VISUAL_REDESIGN_2026-10-25.md` for verification.
