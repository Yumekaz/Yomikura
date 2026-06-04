# Roadmap

Yomikura should be built phase by phase. Each phase must have a narrow definition of done and must not fake work that belongs to a later phase.

## Phase 0 - RFC, Docs, Architecture Lock

Goal: make the project safe and understandable before code starts.

Deliverables:

- public README
- vision document
- architecture document
- roadmap
- Codex task list
- API notes
- legal and branding rules
- security notes
- project blueprint stored under `docs/`

Done when the project explains what it is, what it is not, why Suwayomi is the first backend, why browser APK execution is not allowed, and how the MVP will be built.

## Phase 1 - Web App Shell

Goal: create the React/Vite app without backend claims.

Deliverables:

- React + TypeScript + Vite + Tailwind
- route shells
- dark app shell
- responsive desktop sidebar and mobile bottom navigation
- direct-to-library root route with Settings-based connection fallback
- settings route shell

Done when the app runs locally, navigation works, and no route pretends to load real manga.

## Phase 2 - Settings and Server Connection

Goal: let users configure Suwayomi.

Deliverables:

- server URL input
- save/reset behavior
- persisted settings
- derived GraphQL endpoint
- connection test
- connected/disconnected/error states

Done when a user can enter a server URL, test reachability, and recover from offline or invalid server states.

## Phase 3 - GraphQL Schema and Typed API Layer

Goal: build API access from real Suwayomi schema data.

Deliverables:

- schema inspection notes
- GraphQL client
- typed wrappers or generated types
- API error types
- first real connection query

Done when query names are documented and build/type checks pass without invented API fields.

## Phase 4 - Library Flow

Goal: show the user's real Suwayomi library.

Deliverables:

- library query
- manga grid/list
- search
- sort
- category filter where supported
- loading, empty, offline, and error states

Done when real library entries appear and clicking a manga opens `/manga/:mangaId`.

## Phase 5 - Manga Detail Flow

Goal: expose metadata and chapters.

Deliverables:

- manga detail query
- cover, title, description, source, status
- chapter list
- read/download indicators where available
- continue reading action

Done when a user can open a real manga and select a real chapter.

## Phase 6 - Reader V1

Goal: make reading work end to end.

Deliverables:

- chapter page fetch
- single-page mode
- vertical webtoon mode
- LTR/RTL navigation
- page preloading
- progress saving where supported
- keyboard shortcuts
- mobile tap zones
- image retry state

Done when Library -> Manga -> Chapter -> Reader works on desktop and mobile with backend data.

## Phase 7 - Browse Sources and Search

Goal: discover manga through installed backend sources.

Deliverables:

- installed sources page
- source search
- search results
- manga result detail
- add to library where API supports it

Done when a user can search an installed source and open or add a result.

## Phase 8 - Extension Repo Management

Goal: implement Mihon-like extension repository management without browser APK execution.

Deliverables:

- add repo URL
- repo list
- refresh/delete/copy actions
- Keiyoushi preset helper
- URL validation
- safe fetch errors

Done when Keiyoushi can be added and refreshed as metadata, and bad URLs fail safely.

## Phase 9 - Extension Catalog Parser and UI

Goal: display repository metadata.

Deliverables:

- parser for `index.min.json`
- extension list
- search by name, source, and package
- language filters
- NSFW visibility setting
- detail drawer
- parser fixture tests

Done when the catalog displays correctly and NSFW filtering works.

## Phase 10 - Extension Install/Update Integration

Goal: wire install/update/uninstall only through backend support.

Deliverables:

- inspect actual Suwayomi extension APIs
- installed/update states
- install/update/uninstall actions where supported
- progress and error states
- unsupported capability messaging

Done when the app can manage backend extensions where Suwayomi supports it and never fakes unsupported actions.

## Phase 11 - Updates and History

Goal: support daily reader workflows.

Deliverables:

- updates page
- history page
- group by date
- continue reading
- open chapter from updates/history

Done when users can resume reading and inspect recent updates.

## Phase 12 - Downloads UI

Goal: expose backend downloads.

Deliverables:

- download queue
- chapter download status
- start/cancel/retry/delete where supported
- unsupported states

Done when users can manage backend downloads without opening the default Suwayomi UI.

## Phase 13 - Backup and Restore UI

Goal: expose backend backup workflows.

Deliverables:

- create backup
- restore backup
- status and errors
- compatibility explanation
- destructive restore warning

Done when backup and restore are possible where backend APIs support them.

## Phase 14 - PWA Hardening

Goal: make the app installable and resilient.

Deliverables:

- manifest
- icons
- service worker
- app shell caching
- offline backend page

Done when the app installs as a PWA and opens its shell without a live backend.

## Phase 15 - Public Beta Hardening

Goal: make the repo safe for public release.

Deliverables:

- polished setup docs
- screenshots
- legal disclaimer
- security policy
- contribution guide
- issue templates
- dependency audit
- license review
- no telemetry by default

Done when the project can be published without irresponsible branding, legal, or security claims.
