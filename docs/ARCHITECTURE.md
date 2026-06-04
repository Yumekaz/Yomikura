# Architecture

Yomikura is a browser/PWA frontend. Suwayomi-compatible servers are the backend. Extension repositories are metadata sources.

```text
Web/PWA frontend
  React + TypeScript + Vite
  UI, routing, reader controls, preferences, extension metadata display

        GraphQL / HTTP
              |
              v

Suwayomi-compatible backend
  extension execution, library state, source browse/search,
  manga details, chapters, pages, downloads, backups, tracking

              |
              v

Extension repositories
  index.min.json, index.json, repo.json, APK files, icons
```

## Ownership Boundaries

| Concern | Frontend | Backend |
| --- | --- | --- |
| App layout and navigation | Owns | No |
| Theme and client preferences | Owns | No |
| Server URL setting | Owns | No |
| Reader controls | Owns | No |
| Library state | Displays | Owns |
| Source search/browse | Requests | Owns |
| Manga details and chapters | Displays | Owns |
| Chapter page URLs/data | Renders | Owns |
| Extension repo metadata | Fetches/displays | May expose installed state |
| Extension install/update/run | No | Owns |
| Downloads | Displays controls/status | Owns |
| Backups | Displays workflow | Owns |
| Tracking | Displays workflow | Owns integration |

## Frontend Stack

The planned frontend stack is:

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- `graphql-request`
- Zustand
- IndexedDB or localStorage for client preferences

This stack is deliberately small. It keeps the app flexible enough for a custom reader UI without introducing a large UI framework that fights the design.

## Route Map

Core routes:

```text
/
/library
/updates
/history
/browse
/browse/sources
/browse/extensions
/browse/extension-repos
/manga/:mangaId
/reader/:chapterId
/settings
```

The root route should redirect directly to `/library`. Connection setup belongs in Settings and in compact fallback states when the configured Suwayomi server is missing or unreachable.

## API Rule

Do not hallucinate Suwayomi GraphQL fields.

Before implementing real API calls, inspect the running Suwayomi schema and document the exact queries and mutations in [API Notes](API_NOTES.md). Until then, route shells and UI states must not claim real backend support.

## Extension Repository Rule

Keiyoushi-style indexes are catalog metadata. The frontend may validate and parse metadata fields such as package name, APK filename, language, version, source list, icon path, and NSFW flag.

The frontend must not execute APKs, translate Kotlin extension code, bypass source websites, or pretend browser-side extension installation is possible.

## PWA Boundary

PWA work can cache the app shell and local preferences. Offline chapter caching is a later feature and must be explicit, user-controlled, and legally cautious.
