# Project Roadmap & Milestones

This document tracks the completed milestones and future engineering goals for **Yomikura**.

## Completed Milestones

### Milestone 1 — Core App Shell & Layout
- Configured React + TypeScript + Vite project shell.
- Established responsive sidebar navigation for desktop and bottom bar navigation for mobile screens.
- Programmed core route views for Library, Updates, History, Browse, and Settings.

### Milestone 2 — Server Connection & Settings
- Implemented persistent connection profile storage in browser storage.
- Added real-time connection status badges and connection test utilities.
- Integrated dynamic dark/light theme triggers and Mint, Gold, Coral, Jade, and Plum color accents.

### Milestone 3 — GraphQL API Integration
- Generated typed TypeScript bindings from Suwayomi's GraphQL schema.
- Built a type-safe GraphQL client with query-caching support.

### Milestone 4 — Library & Catalog Browsing
- Configured live library page with cover grids, density settings, category tab filters, and text search.
- Created extension repository management view supporting custom repository URL registration.
- Programmed static extension index catalog parser to display metadata (NSFW filters, language, version).
- Integrated live catalog search across installed sources.

### Milestone 5 — Reader Engine & Downloads
- Developed reader engine supporting LTR, RTL, and Webtoon vertical scrolling modes.
- Added portrait page preloading (next 3 pages) and image fit-width constraints.
- Integrated background downloads manager tracking progress (0% to 100%) and offline disk quota settings.
- Programmed PWA service workers and IndexedDB chapter cache to enable reading downloaded chapters completely offline.

### Milestone 6 — Backup Portability & Tracking
- Added JSON server profiles export/import to allow backup migration.
- Enabled mock trackers (MAL/AniList) inside Sandbox mode.

### Milestone 7 — Native Desktop (Tauri)
- Shipped Windows, macOS, and Linux builds from the same React codebase.
- Onboarding: storage picker, optional JRE + Suwayomi download, portable mode.
- System tray, single-instance lock, window state memory, in-app updater.
- Native menu bar, backend health badge, open-data-folder action.

### Milestone 8 — Power Reader & Library (v0.3 / v1.0)
- Infinite chapters, filters, per-manga overrides, thumbnail navigator, auto-download.
- Bulk library actions, source migration, library virtualization, Mihon-style read dimming.
- Library “check for updates”, extension update-all, extension health panel.

---

## Future Roadmap

- **Distribution:** winget, Homebrew, Chocolatey manifests (scaffolded).
- **Public demo site:** GitHub Pages sandbox build.
- **Full i18n:** Wire all screens to locale files beyond English-first.
- **Global search v2:** Ranking and filter polish.
