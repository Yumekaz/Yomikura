# Product Vision

Yomikura is a Suwayomi client delivered as **web, PWA, and native desktop** from a single React codebase. It offers a premium, Mihon-inspired reading experience on phones, tablets, and PCs.

## Platforms

| Platform | How it runs |
|----------|-------------|
| **Web** | Self-hosted static build or local dev server |
| **PWA** | Installable from the browser; offline chapter cache |
| **Desktop** | Tauri app with tray, updater, and optional local Suwayomi + JRE setup |

## Core Principles

- **Reader-first:** Clean typography, smooth transitions, dark/light themes, customizable accents.
- **Local-first & private:** No Yomikura telemetry. Settings and caches stay on the user's device.
- **Honest boundaries:** Scraping and extensions run in Suwayomi — Yomikura is the UI shell.

## Feature Architecture

1. **Onboarding:** Connect to a remote server, run local Suwayomi (desktop), or try Sandbox demo mode.
2. **Library:** Cover grid, categories, unread badges, read-state dimming, bulk actions, update checks.
3. **Reader:** Webtoon / LTR / RTL, filters, per-manga overrides, infinite chapters, progress sync.
4. **Browse & extensions:** Source search, extension catalog, update-all, health panel.