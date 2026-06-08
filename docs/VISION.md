# Product Vision

Yomikura is a self-hosted web and PWA reader client for Suwayomi-compatible manga and comic libraries. It delivers a premium, browser-first reading interface optimized for modern mobile, tablet, and desktop viewports.

## Core Principles

- **Reader-First Experience:** Focuses on clean typography, smooth transitions, and premium styling (dark modes and customizable accent themes) to create a comfortable reading environment.
- **Local-First & Private:** Stores user configurations and downloaded pages locally in browser memory (IndexedDB/localStorage) without third-party tracking or central servers.
- **Honest System Boundaries:** Maintains a strict separation of concerns, leaving content sourcing, scraping, and extension execution entirely to the user's self-hosted Suwayomi backend.

## Feature Architecture

The application focuses on the following core flows:
1. **Onboarding:** A zero-friction welcome overlay that guides users to connect their server or try the Sandbox mode.
2. **Library Management:** A visual cover grid featuring scaling layouts, category tags, unread chapter counters, and offline caching metrics.
3. **Reader Engine:** An advanced viewer supporting Webtoon vertical scroll, RTL/LTR page navigations, image preloading, and progress syncing.
4. **Browse & Discovery:** A metadata browser for search indexes and extension catalogs.
