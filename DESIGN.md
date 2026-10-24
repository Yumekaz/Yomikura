# Yomikura · The reading room

An ink-and-paper home for a personal comic collection. Artwork leads; reading is the primary action. Keep the existing Yomikura logo and bookmark-red signature.

## Visual direction

- Dark canvas `#101113`, navigation/surfaces `#17181b`, raised controls `#2c2d32`.
- Warm ivory `#f2efe9`, secondary text `#c5c4c2`, muted text `#9a9ba2`, bookmark red `#e5483f`.
- Light mode uses warm paper `#faf9f6`, soft surfaces `#f2f0eb`, and ink controls.
- Inter Variable, supplied locally. Page titles 30px / 680; book titles 12px / 600; secondary information 11–13px.
- Desktop sidebar 216px. Content padding 20–48px, a 24px bookshelf gap and true 2:3 covers. The same measured column count controls rendering and virtualization.
- Small 6–8px control radii, 10–12px surface radii. Minimal elevation; no decorative grid, glow or permanent activity animation.

## Product rules

- Library, Discover, Updates and Downloads are the main destinations. History and Settings are secondary. All six remain reachable on narrow screens.
- Library search and Add books are visible immediately. Actual recent unfinished activity earns a Continue reading card; a new library gets an actionable empty state.
- Titles sit below covers. Never darken readable artwork to communicate completion. Unread counts remain discreet and readable.
- Collections, availability, sorting, view selection, refresh and bulk selection retain their existing behavior.
- Ready / Connecting / Reading offline describe everyday connection states. Server addresses, runtimes, ports and diagnostic errors belong in connection settings or explicit Details disclosures.
- Appearance leads Settings. Desktop setup recommends a managed device library, with folder and portable choices available. Web setup offers a clearly identified demo and an optional existing-library connection.
- Downloads distinguish copies on this device from copies on the connected server. Never imply that server availability guarantees device availability.
- Reader controls stay quiet and preserve the existing chapter ownership, restoration and progress fences.

## Motion and access

Use brief, exact-property feedback: 120–180ms controls, subtle cover lift on fine-pointer hover, no navigation entrance animation. Support reduced motion, light/dark/system themes, high contrast, visible keyboard focus, labelled controls and keyboard access through a long bookshelf.

## Original demo artwork

`public/demo/` contains original generated cover and wordless sample-page artwork for **Moonlit Courier** and **The Paper Garden**. These fictional stories replace unrelated external demo photographs; they are never substituted for a user's metadata or covers. Generated originals and prompts are retained in the local visual-review evidence folder. WebP derivatives are sized for their display slots. Demo artwork is included in the versioned offline application shell.

## Validation target

The chosen ImageGen bookshelf reference is retained as `.cache/visual-upgrade-2026-10-24/library-reference.png`. It is a composition and visual-system target. The implementation retains actual supported filters and displays real activity instead of invented progress, book totals or unsupported sort choices. Review desktop, narrow desktop, mobile, one-book and long-book collections, empty/search states, theme variants, keyboard focus, and actual reading workflows.
