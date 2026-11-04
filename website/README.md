# Yomikura public reading room

This directory owns the public product homepage and no-clone browser installation guide at `https://yumekaz.github.io/Yomikura/`. It is separate from the desktop app's launch flow. No app/native source changes or private reference images are required for the site.

## Visitor paths

- `/Yomikura/`: original brand illustration, actual released-app previews, color-palette exploration, current public desktop downloads and previous stable release.
- `/Yomikura/setup/`: standalone Suwayomi installation, Custom WebUI selection, reversible web-file placement, local-library opening and recovery.
- `/Yomikura/app/#/library`: the released reader in a base-aware, hash-routed demonstration with the project's two original illustrated stories. It starts in demo mode before rendering and does not initially probe a visitor's loopback server.
- `/Yomikura/downloads/`: a prebuilt **root-hosted** browser app ZIP and its SHA-256 file. These are not the subpath-scoped demo files.

The public page does not collect a personal library address. The guide's optional address form navigates directly to the reader's chosen HTTP(S) server in a new tab. Personal data, server state and tracking credentials are never part of website fixtures or screenshots.

## Build and delivery

The GitHub Pages workflow resolves official public release metadata, checks out that exact reader tag in `.reader-source`, and installs its locked dependencies there. Source version, commit and release-asset destinations are validated before building. The website introduces no new runtime framework or dependency.

`scripts/build.mjs` assembles the static homepage, self-hosted fonts, original artwork, a scoped demo and an ordinary root-hosted web ZIP. `scripts/verify.mjs` checks the actual `/Yomikura/` prefix, absence of missing assets, desktop/mobile layouts, keyboard behavior, light/dark appearance, accessibility, current download destinations and real demo reading. The application screenshots are captured from the released app rather than drawn or generated as fake UI. `scripts/live-web-guide.mjs` additionally runs the downloaded web build on a separate real pinned Suwayomi instance using Custom WebUI.

All production reader builds and browser suites run on GitHub Actions. Local preview can serve an already built artifact. Use an isolated, empty output directory for each build; failed artifacts are retained for inspection.

Pushes to main and approved main-branch dispatches deploy only after all website checks pass. Pull requests and feature-branch dispatches produce review artifacts without deploying. No GitHub environment access expansion is needed. The main repository's existing app release workflow and native installer remain separate.

## Original identity and licensing

The night and daylight hero paintings were generated with the built-in image-generation tool for this project. Their exact prompts and references are recorded in `assets/artwork-prompts.json`. Production files use WebP compression of those paintings without content alteration; the original generated PNG files remain private local evidence.

Existing logo, spirit, palette and fictional-story art comes from the project's released `public/identity` and `public/demo` assets. No third-party comic pages, private Mihon screenshots or Odysseus assets/code are included. Odysseus informed the public entry-point idea; Yomikura keeps its own identity and visitor flow.

Inter and Playfair Display are self-hosted under their SIL Open Font License notices, copied into the site by the build. Site icons are small original code-native line drawings. Platform and provider names identify the relevant downloads or services; they are not affiliation claims.

## Backend hosting evidence

The standalone Custom WebUI route was verified from Suwayomi source at v2.3.2243 and v2.4.2366. Both use the persistent `<dataRoot>/webUI` folder. Custom mode serves the supplied files and disables the default interface's automatic update scheduling. Choose Custom before replacing interface files, preserve the old folder and leave library/database/download/extension data unchanged.

- [Suwayomi data-directory guide](https://github.com/Suwayomi/Suwayomi-Server/wiki/The-data-directory)
- [v2.4 web-interface serving and update policy](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/server/util/WebInterfaceManager.kt)
- [Official WebUI Custom setting](https://github.com/Suwayomi/Suwayomi-WebUI/blob/29ff36a0d49120f42ef9195b999f356058e5f677/src/features/settings/Settings.constants.ts)

Hosting-mechanism evidence does not establish full compatibility of every reader feature with every newer server version. The release notes and public guide retain the actual runtime/platform coverage limits.
