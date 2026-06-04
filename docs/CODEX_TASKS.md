# Codex Tasks

Use these tasks as implementation prompts after Phase 0 is accepted. Keep each task narrow. Do not combine phases unless the previous phase is already verified.

## Global Rules

- Do not port Mihon Android/Kotlin code.
- Do not run Android APK extensions in the browser.
- Do not scrape sources from frontend code.
- Do not host content.
- Do not fake backend features.
- Do not claim official affiliation with Mihon, Tachiyomi, Suwayomi, or Keiyoushi.
- Keep mock mode behind an explicit flag and visible UI banner.
- Inspect real Suwayomi schema before implementing GraphQL features.
- Run the app, typecheck, test where available, and read the diff after each task.

## Task 001 - Scaffold Web App

Create a React + TypeScript + Vite + Tailwind frontend.

Implement:

- app shell
- router
- dark theme
- `/` redirects to `/library`
- `/library`
- `/updates`
- `/history`
- `/browse`
- `/browse/sources`
- `/browse/extensions`
- `/browse/extension-repos`
- `/manga/:mangaId`
- `/reader/:chapterId`
- `/settings`
- responsive desktop sidebar
- responsive mobile bottom navigation

Do not connect to backend yet. Do not use mock manga data unless `VITE_MOCK_MODE=true`, and if mock mode exists it must be visibly labeled.

Definition of done:

- install works
- dev server works
- build works
- navigation works
- first page opens the app shell/library route and uses Settings or compact fallback states for connection problems
- no fake backend claims

## Task 002 - Server Settings

Implement server configuration.

Add:

- server URL input
- save/reset
- derived `/api/graphql` endpoint
- connection test button
- persisted settings
- connected/disconnected/error states
- helpful offline state

Do not implement library queries yet.

Definition of done:

- user can set a server URL
- setting persists after refresh
- failed connection shows a useful error

## Task 003 - GraphQL API Layer

Inspect a real running Suwayomi Server schema first.

Add:

- GraphQL client
- typed wrappers or generated types
- API error classes
- real connection test query
- query key conventions
- discovered schema notes in [API Notes](API_NOTES.md)

Definition of done:

- no hallucinated API names
- connection test uses real GraphQL
- build passes
- API notes list exact operations used

## Task 004 - Library Page

Implement the real library flow.

Add:

- library query
- manga grid/list
- loading/error/empty/offline states
- search and sort where data supports it
- category filtering where data supports it
- click-through to `/manga/:mangaId`

Definition of done:

- real library loads from Suwayomi
- backend offline state is graceful

## Task 005 - Manga Detail

Implement manga details.

Add:

- manga metadata query
- cover, title, description, source, status
- chapter list
- read/download indicators where available
- continue reading
- open chapter in `/reader/:chapterId`

Definition of done:

- user can open real manga and select a real chapter

## Task 006 - Reader V1

Implement the first real reader.

Add:

- chapter page fetch
- single-page mode
- vertical webtoon mode
- LTR/RTL navigation
- page preloading
- progress saving where API supports it
- keyboard shortcuts
- mobile tap zones
- image error retry

Definition of done:

- user can read a chapter end to end
- reader works on mobile and desktop

## Task 007 - Extension Repo Management

Implement extension repository management.

Add:

- add repo URL
- repo list
- refresh repo
- delete repo
- copy repo URL
- Keiyoushi preset helper for `https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json`
- URL validation
- fetch status and errors

Do not attempt to install APKs in the browser.

Definition of done:

- Keiyoushi repo can be added and refreshed as metadata
- invalid repo fails safely

## Task 008 - Extension Catalog Parser

Implement the catalog parser and UI.

Add:

- parser for `index.min.json`
- extension list
- search by extension, source, and package
- language filter
- NSFW visibility setting
- extension detail drawer
- parser tests using saved fixtures

Definition of done:

- catalog displays correctly
- NSFW toggle hides and shows flagged entries
- parser has unit tests
- APK execution is not attempted

## Task 009 - Browse/Search Sources

Implement source browsing and search through Suwayomi.

Inspect GraphQL schema first.

Add:

- installed sources page
- source search
- manga search results
- open result detail
- add to library where API supports it

Definition of done:

- user can search an installed source and open or add manga

## Task 010 - Downloads UI

Expose backend download state.

Add:

- download queue page or section
- chapter download status
- start/cancel/retry/delete where supported
- graceful unsupported states

Definition of done:

- user can see and manage backend downloads where supported
