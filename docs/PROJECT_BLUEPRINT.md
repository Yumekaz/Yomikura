# Yomikura — Engineering & Architecture Blueprint

This document outlines the core architecture, technical design, and safety constraints of **Yomikura**, a Mihon-inspired Suwayomi client for **web, PWA, and desktop (Tauri)**.

---

## 1. Product Definition & Vision

Yomikura is an independent client (web, PWA, and Tauri desktop) for user-controlled Suwayomi Server backends — library, browse, extensions metadata, downloads, and progress.

### Core Goals:
- **One codebase, multiple surfaces:** Same React UI in the browser and in a native desktop shell.
- **Polished UX:** Reading interfaces optimized for mobile, tablet, and desktop.
- **Local-first:** Data stays on the user's device — browser storage (web) or chosen data folder (desktop).
- **Aesthetics & Performance:** Modern, responsive dark/light styling with configurable accents and fast image preloading.

---

## 2. Architectural Boundaries & Ownership

To ensure safety, compliance, and clean architecture, Yomikura enforces a strict separation of concerns:

- **Client (Yomikura UI — web or desktop):**
  - Owns the responsive layout, navigation, themes, and client preferences (stored locally).
  - Handles page rendering, image scaling (fit-width constraints), and reader configurations (LTR, RTL, Webtoon).
  - Displays extension repository metadata fetched from index catalogs.

- **Backend (User's Suwayomi Server):**
  - Executes source scraping, manages source network traffic, and runs extensions (Android APKs).
  - Stores the user's library entries, categories, and reading history.
  - Handles background chapter updates, download tasks, backup files, and tracking integrations.

---

## 3. Technology Stack

- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS + CSS variables for accents and themes
- **Routing:** React Router DOM
- **API Client:** TanStack Query + `graphql-request` for type-safe GraphQL connection
- **State Management:** Zustand (for client session and preferences)
- **Local Storage:** IndexedDB (via Cache Storage APIs for offline reader caching)

---

## 4. Safety & Legal Boundaries (Anti-DMCA and Safety Rules)

To protect the software and its users from legal issues and platform shutdowns, Yomikura is built with the following constraints:

1. **Zero Content Hosting:** Yomikura hosts no manga, comic, or copyrighted content. The client is a generic frontend reader shell.
2. **Bring Your Own Backend (BYOB):** Users must configure their own Suwayomi server instance. There is no public central scraper or central parsing infrastructure.
3. **No APK Execution in Browser:** Browsers cannot run Android extensions. Yomikura only reads catalog repository index files (like Keiyoushi's index JSON) to display metadata and lets the user trigger server-side installs.
4. **No Scraped Content Promises:** Yomikura does not ship pre-configured content sources. The extension catalog registry serves as a metadata browser, and all actual reading access is configured through user-supplied servers.
5. **No Telemetry or Tracking:** Yomikura respects user privacy and stores no analytics or remote user logs.

---

## 5. Security & Access Control

- **CORS Handling:** Yomikura handles cross-origin requests gracefully, showing setup guides and connection test tools to help self-hosted users connect their client to their backend securely.
- **Protocol Constraints:** The configured server URL accepts HTTP for local network setups (`localhost` or LAN IPs) and HTTPS for remote setups. Unsafe protocols (such as `data:` or `javascript:`) are blocked.
- **NSFW Content Toggling:** A global settings toggle filters out flagged NSFW extension metadata based on index parameters.
- **Graceful Offline Fallbacks:** If the Suwayomi backend is unreachable, the client switches automatically to Offline Mode, allowing users to browse and read previously cached chapters from local browser storage (IndexedDB/Cache API) without crashing.
