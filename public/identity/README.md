# Yomikura · Ink & Ember identity

The official book-and-spirit mark is a faithful raster recreation of the logo in the user's second supplied Yomikura identity board, received on 2026-10-25. It replaces the earlier book-only in-app mark. The black reading-spirit character and overall atmosphere follow both user-supplied boards.

Assets were created with the built-in image-generation tool: the official mark, four coordinated logo and reading-spirit palette variants, a neutral resting pose, and original night/day sanctuary paintings. Palette edits retain the same composition, with minor generation-level edge variation rather than mathematically identical pixels. No existing comic pages, franchise characters or third-party publisher assets were used.

- `logo-{ember,sakura,forest,moonstone}.webp`: 256×256, transparent outside the parchment tile.
- `spirit-reading-{ember,sakura,forest,moonstone}.webp`: 384×384 RGBA derivatives.
- `spirit-resting.webp`: 384×384 neutral cutout for quiet states.
- `sanctuary-{ember,paper}.webp`: 768×1152 original atmosphere illustrations.

Untouched generated PNG originals, prompts, source-board copies and failed attempts are retained in the local identity evidence folder. Production derivatives use ordinary alpha-margin trimming, resizing and WebP compression; their visual content was not redrawn in code.

The external desktop/PWA icon uses the fixed Ember mark. Runtime palette changes only select the in-app artwork and theme tokens; they never rewrite installed icon files. Native icon formats were generated with Tauri's icon tooling from the same Ember master.

## Integrated sidebar nook

`sidebar-{ember,sakura,forest,moonstone}-{dark,light}.webp` are eight original 384×384 atmosphere paintings. They place the same spirit, books and lantern in a single shared lighting environment. Each palette has both a night and daylight treatment with matching peripheral colors.

The application feathers these paintings into the sidebar using intersecting edge masks and a restrained palette-aware ambient wash. They are not framed cards or floating cutouts. They remain decorative, static, optional and absent from the reader. The standalone spirit poses are retained for other quiet states and palette previews.
