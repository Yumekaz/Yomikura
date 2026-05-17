# Yomikura

Yomikura is an independent Suwayomi-compatible web/PWA manga and comic reader inspired by Mihon.

It is designed for people who run their own Suwayomi Server. The app will focus on a polished browser-first reading experience, extension repository management, library browsing, manga details, and a clean reader engine while keeping extension execution and source logic on the backend.

## What This Is

- A web/PWA frontend for a user-controlled Suwayomi-compatible backend.
- A Mihon/Tachiyomi-inspired reading experience adapted for browser and PWA use.
- A self-hosted interface for library management, source browsing, extension metadata, and reading.
- A project that starts from documented architecture before implementation.

## What This Is Not

- Not an official Mihon project.
- Not an official Tachiyomi project.
- Not an official Suwayomi project.
- Not a manga or comic hosting service.
- Not a public scraping proxy.
- Not an Android/Kotlin-to-web port.
- Not a browser runtime for Android APK extensions.

## Current Status

Phase 9 is active: the app shell, Suwayomi connection, library, details, reader, browse, and extension metadata surfaces exist.

Some reader/source failures can still come from upstream source websites, DNS, Cloudflare protection, or Suwayomi extension behavior rather than Yomikura UI code.

## Target MVP

The MVP is real only when this flow works against an actual Suwayomi-compatible backend:

```text
Connect to Suwayomi
-> show real library
-> open manga details
-> open chapter
-> read chapter properly
-> manage extension repo/catalog metadata honestly
```

Mock UI alone is not the product.

## Planned Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query with `graphql-request`
- Zustand for UI/session state
- Local storage or IndexedDB for client preferences

## Local Development

```bash
pnpm install
pnpm dev
pnpm build
```

The current app shell does not call a backend. Server connection begins in Phase 2.

## Backend Boundary

Yomikura will connect to Suwayomi Server first. Suwayomi owns source execution, extension install/run behavior, library state, chapter page retrieval, downloads, backups, and tracking integration.

The frontend owns app layout, preferences, reader controls, extension repository metadata display, and UI state.

## Extension Repositories

Extension repository indexes such as Keiyoushi's `index.min.json` are metadata catalogs. Yomikura may fetch, validate, parse, search, and display that metadata.

Yomikura must not attempt to install, run, translate, or execute Android APK extensions inside the browser. Extension install and execution belongs to the backend.

## App Entry

Yomikura opens directly into the app shell and uses a local Suwayomi default during development:

```text
http://127.0.0.1:4567
```

Connection setup lives in Settings and appears as a fallback only when the server is missing or unreachable. The product surface should not use fake manga titles, fake library data, or copyrighted-looking previews.

## Documentation

- [Vision](docs/VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Codex Tasks](docs/CODEX_TASKS.md)
- [API Notes](docs/API_NOTES.md)
- [Legal and Branding](docs/LEGAL_AND_BRANDING.md)
- [Security](docs/SECURITY.md)
- [Project Blueprint](docs/PROJECT_BLUEPRINT.md)

## Disclaimer

Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. This app hosts zero manga or comic content.
