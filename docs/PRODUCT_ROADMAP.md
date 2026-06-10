# Yomikura Product Roadmap

A phased plan from **v0.2 → v0.3 → v1.0**, based on the current app, competitive gaps (Mihon, Suwayomi-WebUI, JUI, Kavita/Komga), and highest-impact priorities.

---

## North Star

**Become the best-looking, easiest-to-start Suwayomi desktop client** — Mihon-inspired UX, zero-config local setup, honest legal positioning.

Yomikura is **not** trying to be:
- Android Mihon (extensions ecosystem, mobile gestures)
- Kavita/Komga (file-library server)
- A full Suwayomi-WebUI feature clone

**Winnable lane:** Premium Suwayomi desktop client with Mihon-level *feel* and better onboarding than WebUI/JUI.

---

## Current Baseline (v0.1.1 — Shipped)

Already delivered:
- Tauri desktop + PWA from one codebase
- Embedded Suwayomi backend + storage picker onboarding
- Library, browse, extensions, downloads, reader (WEBTOON / LTR / RTL)
- Offline chapter cache, server profiles, tracker panel
- Signed multi-platform releases + updater artifacts
- Demo/sandbox mode, legal/compliance documentation

---

## Phase 1 — v0.2 "Desktop-Ready"

**Target:** ~6–8 weeks  
**Theme:** Remove friction, feel native

**Goal:** A user downloads Yomikura and it *just works* without thinking about Java, windows, or updates.

### Must-Have

| # | Feature | Why |
|---|---------|-----|
| 1 | **Bundled or auto-installed JRE** | #1 onboarding friction today |
| 2 | **In-app updater UI** | Infra exists (`latest.json`); users need a visible prompt |
| 3 | **System tray + background backend** | Desktop apps should not confusingly kill the server on quit |
| 4 | **Window state memory** | Remember size/position; default 1280×800 |
| 5 | **Single-instance lock** | Prevent duplicate Suwayomi processes |
| 6 | **Cross-platform Java launch** | Fix Windows-only JVM flags for macOS/Linux |
| 7 | **Keyboard shortcuts help overlay** | Shortcuts exist; users do not know them |
| 8 | **Version consistency** | About page, `tauri.conf.json`, `package.json` all aligned |

### Nice-to-Have

- Native menu bar (File → Quit, Help → Check for Updates)
- "Open logs folder" button in Settings
- Backend health indicator in sidebar (running / stopped / port)

### Success Metrics

- First launch → reading first chapter in **under 2 minutes** (with bundled Java)
- Zero duplicate-backend bug reports
- 80%+ of desktop users never manually install Java

### Explicitly NOT in v0.2

- Source migration
- Bulk library actions
- i18n
- Local CBZ import

---

## Phase 2 — v0.3 "Power Reader"

**Target:** ~8–10 weeks  
**Theme:** Match Suwayomi-WebUI depth, beat it on polish

**Goal:** Power users stop saying "just use WebUI instead."

### Must-Have — Reader

| # | Feature | Why |
|---|---------|-----|
| 1 | **Thumbnail page navigator** | Komga / Kavita / WebUI standard |
| 2 | **Per-manga reader settings** | Power users expect overrides |
| 3 | **Infinite chapter reading** | Binge reading without back-nav |
| 4 | **Auto-scroll (webtoon mode)** | WebUI has it; hands-free reading |
| 5 | **Image filters** | Grayscale, invert, brightness — Mihon/WebUI |
| 6 | **Crop borders / page margins** | Cleaner page display |
| 7 | **Auto-download next N chapters** | While reading, via Suwayomi API |
| 8 | **Optional page transition animation** | Toggle; Komga-style polish |

### Must-Have — Library & Catalog

| # | Feature | Why |
|---|---------|-----|
| 9 | **Bulk select + batch actions** | Download, mark read, categorize — WebUI core |
| 10 | **Source migration UI** | Move manga between sources |
| 11 | **Duplicate manga detection** | WebUI settings feature |
| 12 | **Saved source searches** | Reuse frequent searches |
| 13 | **Library virtualization** | Needed at 500+ titles |

### Must-Have — Desktop Polish

| # | Feature | Why |
|---|---------|-----|
| 14 | **Customizable keybinds** | Or at least presets (Mihon-style / WebUI-style) |
| 15 | **Server + app update notifications** | WebUI informs about server/WebUI updates |

### Success Metrics

- Reader feature parity with Suwayomi-WebUI: **~80%**
- Users completing a 50+ chapter binge without leaving reader
- Library with 1000+ entries stays smooth (60fps scroll)

### Explicitly NOT in v0.3

- Multi-user auth
- OPDS
- Local CBZ library
- Full i18n

---

## Phase 3 — v1.0 "World-Class Suwayomi Client"

**Target:** ~10–14 weeks  
**Theme:** Growth, reach, defensible moat

**Goal:** Public recommendation as *the* Suwayomi desktop client.

### Must-Have — Product Completeness

| # | Feature | Why |
|---|---------|-----|
| 1 | **Local CBZ/CBR/PDF import** | Opens non-extension user segment |
| 2 | **i18n (10+ languages)** | WebUI/JUI/Kavita all have this |
| 3 | **Full tracking UX** | MAL / AniList / Kitsu / Shikimori — polish TrackerPanel |
| 4 | **Reading history page** | Wire fully; backend-owned but underused |
| 5 | **Smart collections / reading lists** | "Reading", "Plan to read", custom lists |
| 6 | **Global search v2** | Filters, source scoping, result ranking |
| 7 | **Per-device settings profiles** | Different reader prefs for phone vs desktop |
| 8 | **Auto-delete downloaded chapters after read** | Storage management — WebUI feature |

### Must-Have — Growth & Distribution

| # | Feature | Why |
|---|---------|-----|
| 9 | **Public demo site** | Sandbox mode → live marketing URL |
| 10 | **winget / Chocolatey / Homebrew** | JUI has this; discoverability |
| 11 | **Install size optimization** | 170MB JAR hurts; consider download-on-first-run |
| 12 | **Accessibility pass** | Screen reader labels, reduced motion, contrast mode |
| 13 | **Onboarding skip + re-run** | Settings → "Run setup wizard again" |

### Nice-to-Have (v1.0 or v1.1)

- OPDS feed exposure (third-party reader compatibility)
- Drag-and-drop CBZ onto app window
- Manga cover dynamic theme (WebUI feature)
- Plugin/extension health dashboard
- Portable mode (USB-stick friendly)

### Success Metrics

- Featured/recommended in Suwayomi community as alternative UI
- 10+ language translations at 80%+ completion
- Install → first chapter under **90 seconds** (bundled Java + smaller download)
- Comparable user satisfaction to Mihon for *desktop reading feel*

---

## Visual Timeline

```text
NOW          v0.2              v0.3              v1.0
(v0.1.1)     Desktop-ready     Power reader      World-class
  |              |                  |                |
  |-- shipped ---|-- 6-8 wks -------|-- 8-10 wks ----|-- 10-14 wks --|
                 |                  |                |
                 Java bundle        Reader depth     i18n + local files
                 Tray + updates     Bulk library     Distribution
                 Window polish      Migration        Demo site
```

---

## Priority Matrix

| Impact ↑ / Effort → | Low effort | High effort |
|---------------------|------------|-------------|
| **High impact** | Updater UI, shortcuts overlay, version fix, health badge | Bundled JRE, bulk actions, infinite chapters, virtualization |
| **Medium impact** | Window state, single-instance, log folder button | Source migration, i18n, local CBZ, keybind editor |
| **Low impact (defer)** | Native menus | OPDS, annotations, Send to Kindle |

---

## Competitive Milestones

| Milestone | Phase | What it means |
|-----------|-------|---------------|
| Beat **Suwayomi-JUI** on UX | v0.2 | Better onboarding, UI, updates, tray |
| Match **Suwayomi-WebUI** reader | v0.3 | Power users do not need WebUI |
| Beat **Suwayomi-WebUI** on design | v0.3 | Subjective but achievable |
| Approach **Mihon** reader feel (desktop) | v1.0 | Filters, per-manga settings, binge flow |
| Compete with **Kavita PWA** on mobile web | v1.0+ | Gestures, install UX — lower priority |

---

## What NOT to Build (Stay in Lane)

| Feature | Why skip (for now) |
|---------|-------------------|
| Own extension scraping logic | Legal + architecture boundary |
| Full file-server (Komga clone) | Different product; Suwayomi handles sources |
| Android native app | Mihon/JUI own that space |
| Multi-user server auth | Suwayomi server concern, not client |
| Central hosted manga catalog | Violates BYOB + legal positioning |
| Anime streaming / media server | Scope creep |

---

## Release Cadence

| Version | Cadence | Type |
|---------|---------|------|
| v0.1.x | As needed | Bugfix patches |
| v0.2.0 | ~2 months | Desktop polish release |
| v0.2.x | Biweekly | Fixes |
| v0.3.0 | ~2.5 months | Reader + library power release |
| v1.0.0 | ~3 months after v0.3 | Public "ready" launch |

---

## v1.0 Definition of Done

Yomikura v1.0 is ready when:

1. **Install → read** works in under 90 seconds with zero manual Java setup
2. **Reader** has thumbnail nav, infinite chapters, filters, per-manga settings
3. **Library** supports bulk actions, migration, 1000+ entries without lag
4. **Desktop** has tray, updates, window memory, single instance
5. **10+ languages** via community translation
6. **Local CBZ** import works for offline libraries
7. **Public demo** + winget/Homebrew distribution exist
8. **No critical** "just use WebUI instead" gaps in community feedback

---

## Quick Start: Next 5 Tasks (v0.2 Kickoff)

1. Bundle JRE or add automatic Temurin download in onboarding
2. Wire updater plugin → "Update available" dialog in Settings
3. Add system tray with Show / Quit / Backend status
4. Fix cross-platform Java args + single-instance guard
5. Ship keyboard shortcuts overlay (`?` key in reader)

---

## Competitive Reference

| App | Role in market |
|-----|----------------|
| [Mihon](https://mihon.app/) | Gold-standard mobile reader UX |
| [Suwayomi-WebUI](https://github.com/Suwayomi/Suwayomi-WebUI) | Default official Suwayomi UI |
| [Suwayomi-JUI](https://github.com/Suwayomi/Suwayomi-JUI) | Native Compose desktop/Android client |
| [Kavita](https://www.kavitareader.com/) | Best self-hosted file-based library + reader |
| [Komga](https://komga.org/) | Lightweight self-hosted comic/manga server |

---

*Last updated: June 2026 — based on v0.1.1 competitive research and shipped feature audit.*