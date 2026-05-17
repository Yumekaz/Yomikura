# Mihon-Inspired Web/PWA Reader — Full Product & Engineering Blueprint

> **Working name:** Yomikura  
> **Document version:** v0.1  
> **Last updated:** 2026-05-08  
> **Audience:** You, Codex GPT-5.5, future contributors, senior engineers reviewing the architecture.  
> **Status:** Planning/RFC. No production code should be written before Phase 0 is accepted.

---

## 0. Brutal one-line summary

We are **not** converting Mihon Android into a website.

We are building a **public-quality Mihon-inspired web/PWA client** that connects to a **Suwayomi-compatible backend**, supports **extension repo management**, provides a polished **library → manga details → chapter reader** flow, and eventually becomes a strong self-hosted manga/comic reading interface.

---

## 1. The product we are making

### 1.1 Product definition

We are building:

> A polished web/PWA manga and comic reader frontend inspired by Mihon/Tachiyomi UX, designed to connect to Suwayomi Server or a compatible backend for extension execution, library management, source browsing, downloads, backups, and reading progress.

### 1.2 What the app should feel like

The app should feel like:

- Mihon-level UX, but browser/PWA-first.
- A serious reader, not a random manga website.
- Self-hosted/local-first where possible.
- Fast on mobile, tablet, and desktop.
- Installable as a PWA.
- Beautiful enough that normal users enjoy it.
- Clean enough that senior engineers do not call it a toy.

### 1.3 Public positioning

Use this kind of public positioning:

> A self-hosted web/PWA client for Suwayomi-compatible manga and comic libraries.

Avoid this kind of positioning:

> Free manga website.

> Mihon Web.

> Tachiyomi in browser.

> We provide manga/content.

### 1.4 Primary MVP statement

The true MVP is:

```text
Connect to Suwayomi
→ show real library
→ open manga details
→ open chapter
→ read chapter properly
→ manage extension repos/catalog metadata
```

If this flow works smoothly, the project is real.

If only the UI exists with mock data, it is not yet real.

---

## 2. Existing ecosystem facts

### 2.1 Mihon

Mihon is an open-source Android manga/comic reader. It is Android-first and uses Android/Kotlin architecture. It has features such as local reading, configurable reader modes, tracker support, categories, themes, scheduled library updates, and backups.

Important point:

```text
Mihon is a reference for UX and features.
Mihon is not the codebase we should directly port to web.
```

Mihon also states that the app hosts zero content. Our project must follow the same spirit.

Source:
- https://github.com/mihonapp/mihon

### 2.2 Keiyoushi extension repo

Keiyoushi provides an extension repository for Mihon and variants.

Important URL:

```text
https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json
```

Important point:

```text
The Keiyoushi repo index is extension catalog metadata.
It is not web-executable plugin code.
```

The repo includes files/folders such as:

```text
apk/
icon/
index.json
index.min.json
repo.json
index.html
```

Source:
- https://github.com/keiyoushi/extensions

### 2.3 Extension source reality

Mihon/Tachiyomi extensions are Android/Kotlin-oriented and distributed as APKs.

Important point:

```text
A browser cannot directly install and execute Android APK extensions.
```

Therefore:

```text
Frontend can display extension metadata.
Backend must install/run/execute extensions.
```

Related source:
- https://github.com/keiyoushi/extensions-source

### 2.4 Suwayomi Server

Suwayomi Server is an independent Mihon/Tachiyomi-compatible server. It can run extensions built for Mihon/Tachiyomi, provide library/download/source functionality, and expose APIs for clients.

Important point:

```text
Suwayomi is our V1 backend.
```

Why:

- It already handles extension execution.
- It already has source browsing/searching.
- It already has library support.
- It already has downloads.
- It already supports Mihon/Tachiyomi-compatible backups.
- It exposes a GraphQL API.
- It runs on multiple platforms.

Sources:
- https://github.com/Suwayomi/Suwayomi-Server
- https://github.com/Suwayomi/Suwayomi-Server/blob/master/CONTRIBUTING.md

---

## 3. Non-negotiable architectural truths

These are not preferences. These are hard constraints.

### 3.1 Do not directly port Mihon Android to web

Bad idea:

```text
Clone Mihon source code and convert it to React.
```

Why this is bad:

- Mihon is Android-first.
- Android UI, storage, lifecycle, permissions, and background behavior do not map cleanly to browser APIs.
- The extension system is not browser-native.
- Codex will likely generate fake wrappers, broken ports, or massive garbage code.

Correct approach:

```text
Study Mihon for product behavior and UX.
Build a fresh web/PWA frontend.
Use Suwayomi-compatible backend for real source functionality.
```

### 3.2 Browser cannot run Android extension APKs

Bad idea:

```text
Download APK in browser → run extension logic in JS.
```

Correct approach:

```text
Frontend fetches/displays repo index metadata.
Backend installs/runs extensions.
Frontend calls backend API.
```

### 3.3 Do not become a content host

The app should not ship content, scrape content from our public server, or proxy everyone’s reading traffic through our infrastructure.

Correct public model:

```text
Static frontend / PWA
+
User connects their own Suwayomi Server
```

Dangerous model:

```text
Our cloud server runs all extensions for everyone.
```

Why dangerous:

- Legal risk.
- Abuse risk.
- Infrastructure cost.
- Source website blocks.
- Content provider complaints.
- Security exposure from running user-selected extensions server-side.

### 3.4 Do not fake backend features

Mock mode is allowed only when clearly labelled.

Allowed:

```text
VITE_MOCK_MODE=true
```

Not allowed:

```text
Pretend install/update/search works when it is only fake local state.
```

### 3.5 Every feature needs a definition of done

No vague tasks like:

```text
Make reader good.
```

Good task:

```text
Implement vertical webtoon reader mode:
- loads page images from backend
- preloads next 3 pages
- preserves scroll progress
- saves read progress every 5 seconds or page boundary
- handles image load failure with retry button
- supports next chapter at bottom
```

---

## 4. High-level architecture

### 4.1 System diagram

```text
┌──────────────────────────────────────────────────────────────┐
│                    Web/PWA Frontend                          │
│  React + TypeScript + Vite + Tailwind                        │
│                                                              │
│  - Library UI                                                │
│  - Manga details UI                                          │
│  - Reader engine UI                                          │
│  - Browse/search UI                                          │
│  - Extension repo UI                                         │
│  - Settings                                                  │
│  - Local preferences/cache via IndexedDB/localStorage         │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ GraphQL / HTTP
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Suwayomi Server                           │
│                                                              │
│  - Extension install/run                                     │
│  - Source search/browse                                      │
│  - Manga metadata                                            │
│  - Chapter pages                                             │
│  - Library/categories                                        │
│  - Downloads                                                 │
│  - Backups                                                   │
│  - Trackers                                                  │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ Extension repo metadata + APKs
                               ▼
┌──────────────────────────────────────────────────────────────┐
│              Extension Repositories                          │
│                                                              │
│  Example: Keiyoushi                                          │
│  - index.min.json                                            │
│  - index.json                                                │
│  - repo.json                                                 │
│  - APK files                                                 │
│  - icons                                                     │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 V1 data ownership

| Concern | Frontend owns | Backend owns |
|---|---:|---:|
| App layout | Yes | No |
| Theme | Yes | No |
| Reader UI controls | Yes | No |
| Page image rendering | Yes | Provides URLs/data |
| Extension metadata display | Yes | Also may expose installed state |
| Extension execution | No | Yes |
| Source search | No | Yes |
| Manga details | Displays | Fetches |
| Chapter pages | Displays | Fetches |
| Library | Displays | Stores |
| Downloads | Displays actions/status | Performs downloads |
| Backups | UI | Performs backup/restore |
| Tracking | UI flow | Server integration |
| User-configured server URL | Yes | No |

---

## 5. Suggested tech stack

### 5.1 Frontend

Recommended stack:

```text
React
TypeScript
Vite
Tailwind CSS
TanStack Query or Apollo/urql
Zustand
React Router
IndexedDB wrapper: Dexie or idb-keyval
PWA plugin for Vite later
```

### 5.2 GraphQL client

Options:

1. **urql**
   - Lightweight.
   - Good for simple GraphQL.
   - Nice for a PWA.

2. **Apollo Client**
   - Heavier.
   - Strong caching.
   - More ecosystem.

3. **graphql-request + TanStack Query**
   - Very clean.
   - Easy to control.
   - Good for app where we want query caching but not a giant GraphQL client.

Recommended:

```text
Start with graphql-request + TanStack Query.
Move to Apollo/urql only if needed.
```

### 5.3 Styling

Use:

```text
Tailwind CSS
CSS variables for theme tokens
Headless UI/Radix UI if needed
Lucide icons
```

Avoid:

```text
Huge UI framework that fights the custom Mihon-like UI.
```

### 5.4 State split

Use:

```text
TanStack Query → server/cache state
Zustand → UI/session state
IndexedDB/localStorage → persisted client preferences
```

Examples:

| Data | Store |
|---|---|
| Server URL | localStorage or IndexedDB |
| Theme | localStorage |
| NSFW visibility toggle | localStorage |
| Reader mode | localStorage |
| Library query result | TanStack Query |
| Manga detail result | TanStack Query |
| Current reader controls open/closed | Zustand |
| Reading progress | Backend first, local optimistic cache optional |

---

## 6. Repository structure

Recommended repo layout:

```text
manga-web-reader/
  README.md
  LICENSE
  package.json
  pnpm-lock.yaml

  docs/
    VISION.md
    ARCHITECTURE.md
    ROADMAP.md
    CODEX_TASKS.md
    API_NOTES.md
    LEGAL_AND_BRANDING.md
    SECURITY.md
    CONTRIBUTING.md
    RELEASE_CHECKLIST.md

  src/
    app/
      App.tsx
      router.tsx
      providers.tsx

    config/
      env.ts
      constants.ts

    api/
      graphql/
        client.ts
        queries/
        mutations/
        generated/
      suwayomi/
        connection.ts
        types.ts
        errors.ts

    domain/
      manga/
        types.ts
      chapter/
        types.ts
      extension/
        types.ts
        repoIndexParser.ts
      reader/
        types.ts
      library/
        types.ts

    features/
      library/
        LibraryPage.tsx
        LibraryGrid.tsx
        LibraryFilters.tsx
      manga/
        MangaDetailPage.tsx
        ChapterList.tsx
      reader/
        ReaderPage.tsx
        components/
          ReaderToolbar.tsx
          PageRenderer.tsx
          WebtoonScroller.tsx
          SinglePageViewer.tsx
          DoublePageViewer.tsx
        hooks/
          useReaderProgress.ts
          usePagePreload.ts
      browse/
        BrowsePage.tsx
        SourcesPage.tsx
        ExtensionsPage.tsx
        ExtensionReposPage.tsx
      updates/
        UpdatesPage.tsx
      history/
        HistoryPage.tsx
      settings/
        SettingsPage.tsx
        ServerSettings.tsx
        ReaderSettings.tsx

    components/
      layout/
        AppShell.tsx
        BottomNav.tsx
        Sidebar.tsx
        TopBar.tsx
      ui/
        Button.tsx
        Card.tsx
        Dialog.tsx
        EmptyState.tsx
        ErrorState.tsx
        LoadingSkeleton.tsx
        Toggle.tsx

    stores/
      useSettingsStore.ts
      useReaderStore.ts
      useNavigationStore.ts

    storage/
      indexedDb.ts
      settingsStorage.ts

    styles/
      globals.css
      theme.css

    test/
      setup.ts

  public/
    icons/
    manifest.webmanifest
```

---

## 7. Route map

### 7.1 Core routes

```text
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

### 7.2 Later routes

```text
/settings/server
/settings/reader
/settings/appearance
/settings/backup
/settings/about
/downloads
/trackers
/debug/graphql
/onboarding
```

### 7.3 Route priority

| Priority | Route | Why |
|---:|---|---|
| P0 | `/library` | Main app home |
| P0 | `/manga/:mangaId` | Required for reading flow |
| P0 | `/reader/:chapterId` | Core product |
| P0 | `/settings` | Server URL needed |
| P1 | `/browse` | Discovery |
| P1 | `/browse/extensions` | Extension visibility |
| P1 | `/browse/extension-repos` | Mihon-like repo management |
| P2 | `/updates` | Mihon-like core feature |
| P2 | `/history` | Mihon-like core feature |
| P3 | `/downloads` | Serious power-user feature |

---

## 8. Domain model

This is conceptual. Actual fields must be adjusted after inspecting Suwayomi’s GraphQL schema.

### 8.1 Manga

```ts
type Manga = {
  id: string;
  title: string;
  author?: string;
  artist?: string;
  description?: string;
  thumbnailUrl?: string;
  sourceId?: string;
  sourceName?: string;
  status?: "ONGOING" | "COMPLETED" | "UNKNOWN" | string;
  inLibrary: boolean;
  unreadCount?: number;
  chapterCount?: number;
  lastUpdatedAt?: string;
  categories?: Category[];
};
```

### 8.2 Chapter

```ts
type Chapter = {
  id: string;
  mangaId: string;
  name: string;
  chapterNumber?: number;
  scanlator?: string;
  uploadedAt?: string;
  read: boolean;
  bookmarked?: boolean;
  downloaded?: boolean;
  pageCount?: number;
};
```

### 8.3 Page

```ts
type ChapterPage = {
  index: number;
  imageUrl: string;
  width?: number;
  height?: number;
};
```

### 8.4 Category

```ts
type Category = {
  id: string;
  name: string;
  order?: number;
};
```

### 8.5 Extension repository

```ts
type ExtensionRepo = {
  id: string;
  name?: string;
  url: string;
  addedAt: string;
  lastRefreshedAt?: string;
  status: "unknown" | "ok" | "error";
  errorMessage?: string;
};
```

### 8.6 Extension catalog item

Exact Keiyoushi index field names must be confirmed by inspecting the JSON. Conceptually:

```ts
type ExtensionCatalogItem = {
  name: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  language: string;
  nsfw: boolean;
  apkUrl?: string;
  iconUrl?: string;
  sources?: ExtensionSourceInfo[];
};
```

### 8.7 Extension source info

```ts
type ExtensionSourceInfo = {
  id?: string;
  name: string;
  language?: string;
  baseUrl?: string;
};
```

---

## 9. Extension repo module

This module is important because you specifically want the Mihon-like repo behavior shown in the screenshots.

### 9.1 User flow

```text
Browse
→ Extension repos
→ Add repo
→ Paste URL
→ Validate URL
→ Fetch index.min.json
→ Parse metadata
→ Save repo
→ Show repo card
→ Open catalog
→ Search/filter extension list
→ Install/update through backend if supported
```

### 9.2 Keiyoushi default repo

Default known repo URL:

```text
https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json
```

Should it be preloaded by default?

Recommended for V1:

```text
No hardcoded auto-enable.
Show a guided "Add Keiyoushi repo" button or onboarding preset.
```

Why:

- User is choosing their sources.
- Public project avoids looking like it is shipping content/source behavior by default.
- Cleaner responsibility boundary.

### 9.3 What frontend can do alone

Frontend can:

- Store repo URLs.
- Fetch repo index JSON.
- Parse metadata.
- Display extension cards.
- Search extensions.
- Filter by language.
- Filter NSFW entries based on setting.
- Compare catalog version with installed version if installed state is available from backend.
- Copy repo URL.
- Delete repo.
- Refresh repo.

### 9.4 What frontend cannot do alone

Frontend cannot properly:

- Install Android APK extensions into browser.
- Execute Kotlin source logic.
- Bypass Cloudflare-heavy websites.
- Run Android compatibility layer.
- Safely scrape arbitrary sources client-side.
- Guarantee CORS access to source websites.

### 9.5 Backend-required actions

Backend must handle:

- Install extension.
- Update extension.
- Uninstall extension.
- Load source list from installed extension.
- Execute search/browse/detail/chapter/page functions.
- Manage extension errors.
- Manage source preferences if supported.
- Handle download queue.

### 9.6 Extension repo validation

When adding a repo URL:

Minimum validation:

```text
- Must be HTTPS.
- Must return JSON.
- Must not be a local/private network URL unless advanced mode is enabled.
- Must have expected index shape.
- Must not exceed size limit.
- Must timeout cleanly.
```

Suggested safety constraints:

```text
Max response size: 10–25 MB initially
Timeout: 10–20 seconds
Allowed protocols: https only by default
Disallow file://, data:, javascript:
Warn for raw IP/private LAN URLs
```

### 9.7 NSFW toggle

Mihon has an NSFW visibility option. Our version should also have:

```text
Settings → Browse → Show NSFW sources/extensions
```

Rules:

- Default should be off.
- When off, hide NSFW extension/source entries from normal lists.
- Make clear that metadata flags may be wrong.
- Do not claim this fully prevents NSFW content.
- If enabled, require an explicit user setting.

### 9.8 Extension list UI fields

Display:

- Extension name.
- Language.
- Version.
- Installed/update status.
- NSFW badge if applicable.
- Source count.
- Package name in details.
- Repo name.
- Install/update/uninstall action if backend supports it.

---

## 10. Backend integration module

### 10.1 Backend target

V1 backend target:

```text
Suwayomi Server
```

### 10.2 API style

Suwayomi exposes GraphQL at:

```text
/api/graphql
```

There is also GraphiQL at the same route for exploration.

### 10.3 Server URL setting

The frontend must not hardcode the server.

User should configure:

```text
http://localhost:4567
```

or whatever their Suwayomi instance uses.

Store:

```text
serverBaseUrl
```

Then derive:

```text
graphqlEndpoint = `${serverBaseUrl}/api/graphql`
```

### 10.4 Connection test

Connection test should check:

- Server reachable.
- GraphQL endpoint reachable.
- Basic schema/query works.
- Version info if available.
- Friendly error if CORS/network fails.

### 10.5 API discovery rule

Before implementing queries:

```text
Codex must inspect actual GraphQL schema.
Do not hallucinate query names.
```

Suggested workflow:

```text
1. Run Suwayomi locally.
2. Open /api/graphql.
3. Export schema using introspection.
4. Generate TypeScript types.
5. Implement minimal queries.
```

### 10.6 Typed GraphQL

Recommended tools:

```text
graphql-codegen
graphql-request
TanStack Query
```

Possible scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest",
    "codegen": "graphql-codegen --config codegen.ts"
  }
}
```

### 10.7 Offline backend handling

If backend is offline, app should show:

```text
Disconnected
Set up or start your Suwayomi Server to use library, browse, and reader features.
```

Do not crash.

---

## 11. Reader engine

This is the heart of the product. If the reader is bad, the app is bad.

### 11.1 Reader modes

Required:

```text
Single page
Vertical webtoon scroll
Right-to-left page navigation
Left-to-right page navigation
```

Later:

```text
Double page/spread
Continuous vertical manga mode
Fit width
Fit height
Original size
Paged vertical
```

### 11.2 Reader controls

Reader toolbar should include:

- Back.
- Manga title/chapter name.
- Page indicator.
- Reader mode switch.
- Direction switch.
- Brightness/theme overlay later.
- Next/previous chapter.
- Settings.
- Fullscreen.

### 11.3 Navigation

Mobile:

- Tap left/right zones.
- Tap center to toggle controls.
- Swipe maybe later.
- Vertical scroll for webtoon mode.

Desktop:

- Arrow keys.
- A/D or H/L optional.
- Space/page down for webtoon.
- F for fullscreen.
- Esc to close controls/back out.

### 11.4 Preloading

Minimum:

```text
Preload current page.
Preload next 2–3 pages.
Preload previous 1 page.
```

Webtoon mode:

```text
Lazy render images near viewport.
Preload upcoming images based on scroll direction.
```

### 11.5 Progress saving

Progress should save:

- On page change.
- On chapter completion.
- Every N seconds in webtoon mode.
- On route leave.
- On visibility change/page unload where possible.

Avoid:

```text
Sending progress update on every scroll pixel.
```

### 11.6 Image error handling

Each image should have:

- Loading placeholder.
- Retry button on failure.
- Error message.
- Optional "open raw image" debug action in dev mode.

### 11.7 Reader performance

Must avoid:

- Rendering 200 full-resolution images at once.
- Storing huge images in React state.
- Blocking main thread during page decoding.
- Re-rendering whole reader on each scroll event.

Use:

- Virtualization/lazy rendering for webtoon mode.
- IntersectionObserver.
- Memoized page components.
- CSS containment if useful.
- Debounced progress update.

---

## 12. Library module

### 12.1 Library page

Features:

- Grid/list view.
- Manga cover.
- Title.
- Unread badge.
- Downloaded badge if available.
- Category filter.
- Sort.
- Search.
- Pull/refresh or button refresh.
- Empty state.

### 12.2 Library sorting

Initial sorts:

- Title.
- Latest update.
- Unread count.
- Date added if available.
- Last read if available.

### 12.3 Category support

Should support:

- All.
- Uncategorized.
- User categories.
- Multi-category filtering later.

### 12.4 Exit criteria

Library is done when:

```text
User can connect to real backend and see real library.
User can search/filter/sort without the UI breaking.
User can click a manga and reach detail page.
```

---

## 13. Manga detail module

### 13.1 Detail page elements

Required:

- Cover.
- Title.
- Author/artist if available.
- Description.
- Source.
- Status.
- In-library status.
- Add/remove library action.
- Chapter list.
- Continue reading.
- Download state if available.

### 13.2 Chapter list

Features:

- Read/unread indicator.
- Download indicator.
- Chapter date.
- Scanlator if available.
- Sort ascending/descending.
- Mark read/unread later.
- Download/delete action later.

### 13.3 Exit criteria

Manga detail is done when:

```text
User can open a real manga from library/search.
User can see chapters.
User can open a chapter into reader.
```

---

## 14. Browse and search module

### 14.1 Sources page

Features:

- Installed sources.
- Language grouping.
- Search source by name.
- Pin/favorite source later.
- Source settings later.

### 14.2 Source search

Features:

- Select source.
- Search query.
- Show results.
- Open result detail.
- Add to library.

### 14.3 Browse latest/popular

If backend exposes:

- Popular manga.
- Latest updates.
- Source filters.

Implement after basic search.

### 14.4 Exit criteria

Browse is done when:

```text
User can pick an installed source, search, open manga, and add it to library.
```

---

## 15. Updates module

### 15.1 Purpose

Mihon users expect updates: newly fetched chapters from library manga.

### 15.2 Features

- Date-grouped updates.
- Manga title.
- Chapter name.
- Read/unread status.
- Open chapter.
- Mark read/unread later.
- Trigger library update if backend supports.

### 15.3 Exit criteria

Updates is done when:

```text
User can see latest updated chapters from backend and open one.
```

---

## 16. History module

### 16.1 Features

- Recently read manga/chapters.
- Continue reading.
- Time read.
- Clear item later.
- Search history later.

### 16.2 Exit criteria

History is done when:

```text
User can resume recently read chapters.
```

---

## 17. Downloads module

### 17.1 V1 downloads strategy

For V1, do not implement browser image caching as the main download system.

Use backend download state first.

Frontend displays:

- Download queue.
- Downloaded chapters.
- In-progress.
- Failed.
- Retry/cancel/delete if API supports.

### 17.2 PWA offline app shell

PWA should cache:

- App shell.
- Static JS/CSS/assets.
- Icons.
- Basic offline page.

Do not blindly cache:

- Every chapter image.
- Gigabytes of content in browser storage.

### 17.3 Later offline chapter caching

Possible later:

- User opts into browser-side chapter cache.
- Use IndexedDB/Cache Storage.
- Storage quota display.
- Manual clear cache.
- Per-manga/chapter caching.

But this should not be V1.

---

## 18. Settings module

### 18.1 Settings categories

```text
Server
Appearance
Reader
Browse
Extension Repos
Library
Downloads
Backup
Advanced
About
```

### 18.2 Server settings

- Server base URL.
- Connection status.
- Test connection.
- Clear cached API data.
- Multi-server profiles later.

### 18.3 Appearance settings

- Dark/light/system.
- Accent color.
- Compact mode later.
- Cover grid density.

### 18.4 Reader settings

- Default reader mode.
- Default direction.
- Fit mode.
- Keep screen awake? Browser support limited.
- Preload count.
- Show page number.
- Background color.

### 18.5 Browse settings

- Show NSFW extensions/sources.
- Hide entries already in library.
- Preferred languages later.

### 18.6 Advanced settings

- Mock mode indicator.
- Debug logs.
- GraphQL endpoint display.
- Reset all local settings.
- Export frontend settings.

---

## 19. Legal, branding, and public safety

### 19.1 Naming

Do not call the project:

```text
Mihon Web
Tachiyomi Web
Official Mihon Desktop
Official Tachiyomi Browser
```

Safer naming:

```text
A new independent name
```

Public description:

```text
A web/PWA client for Suwayomi-compatible manga and comic libraries.
```

### 19.2 Disclaimer

Include disclaimer:

```text
This project is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider.
This application hosts zero content.
Users are responsible for configuring their own server, sources, and repositories.
```

### 19.3 License compatibility

Need to review:

- Our code license.
- Mihon license if reusing code/assets.
- Suwayomi license if reusing code.
- Icon/logo restrictions.
- Keiyoushi repo terms.

Recommended:

```text
Do not reuse Mihon assets/logo/name.
Use original branding.
Use references only in docs.
```

### 19.4 Do not ship source repos as content promises

Do not market:

```text
Built-in free sources.
```

Say:

```text
Supports user-configured extension repositories through a compatible backend.
```

### 19.5 No central hosted scraping

If we host a demo:

- It should use mock data or a local demo backend.
- Do not host public extension execution for everyone.
- Do not proxy content.

---

## 20. Security

### 20.1 Frontend security risks

Risks:

- Malicious repo URL.
- Huge JSON response.
- XSS through extension/source metadata.
- Unsafe image URLs.
- Mixed content issues.
- Local network access confusion.
- Leaking server URL.

Mitigations:

- Escape/render all text safely.
- Do not use `dangerouslySetInnerHTML` for metadata.
- Limit JSON fetch size where possible.
- Timeout repo fetches.
- Validate URL protocol.
- Warn for insecure HTTP.
- Store only necessary settings.
- No telemetry by default.

### 20.2 Backend trust boundary

The frontend talks to a backend controlled by the user.

Do not assume:

- Backend is always trusted.
- Backend returns clean strings.
- Backend returns valid URLs.
- Backend is reachable.
- Backend is same-origin.

### 20.3 CORS

Many users will run frontend and backend separately.

Need support:

- Configurable server URL.
- Helpful CORS error messages.
- Docs explaining local setup.

### 20.4 Extension repo URL validation

Default:

```text
Allow HTTPS only.
```

Advanced mode:

```text
Allow localhost/private HTTP for self-hosters.
```

### 20.5 Dependency security

Before public release:

```text
pnpm audit
npm audit if npm used
dependency review
GitHub Dependabot
lockfile committed
```

---

## 21. Performance goals

### 21.1 App load

Targets:

- Fast first load.
- Code-split reader and heavy pages.
- Avoid giant initial bundle.

### 21.2 Library performance

Should handle:

```text
1,000+ library entries
```

Use:

- Virtualized list/grid later.
- Efficient search/filter.
- Image lazy loading.

### 21.3 Reader performance

Should handle:

```text
100+ pages in webtoon mode
```

Use:

- Lazy loading.
- IntersectionObserver.
- Avoid holding blobs in JS memory unless needed.
- Avoid global state for each image load.

### 21.4 Mobile performance

Must test on:

- Android Chrome.
- Low/mid-range phone.
- Tablet width.
- Desktop width.

---

## 22. Testing strategy

### 22.1 Unit tests

Test:

- Extension repo parser.
- URL validation.
- Settings storage.
- Reader progress logic.
- Sort/filter functions.

### 22.2 Integration tests

Test:

- Server connection flow.
- Library query rendering.
- Manga detail loading.
- Reader page loading.
- Extension repo add/refresh flow.

### 22.3 E2E tests

Use Playwright.

Flows:

```text
1. Onboarding → set server URL → library loads.
2. Library → manga detail → reader.
3. Extension repos → add repo → catalog visible.
4. Backend offline → graceful error.
5. NSFW off → NSFW items hidden.
6. NSFW on → NSFW items visible.
```

### 22.4 Mock backend

Need a mock mode for testing/demo.

Rules:

- Clearly labelled.
- No fake claim of real functionality.
- Data should be in fixtures.
- Used for UI tests and demo only.

Suggested:

```text
src/test/fixtures/
src/mocks/
```

### 22.5 Manual QA checklist

Before release:

- Mobile nav works.
- Back button works.
- Reader does not trap user.
- Settings persist.
- Offline backend error is understandable.
- Extension repo bad URL fails gracefully.
- Long manga titles do not break UI.
- Huge library remains usable.
- No console error spam.

---

## 23. Development methodology

### 23.1 Model

Use:

```text
Macro-waterfall, micro-agile
```

Meaning:

- Big architecture and phases are planned upfront.
- Each phase is implemented in small Codex tasks/PRs.
- No giant "build everything" task.

### 23.2 Why not pure waterfall?

Because API details, GraphQL schema, extension install support, and reader behavior will change once we touch the real backend.

### 23.3 Why not chaotic agile?

Because Codex will create messy architecture if goals are vague.

### 23.4 Correct workflow

```text
Plan phase
→ Write definition of done
→ Give Codex one small task
→ Build
→ Run
→ Review
→ Fix
→ Commit
→ Next task
```

---

## 24. Phase roadmap

## Phase 0 — RFC, docs, and architecture lock

### Goal

Create the planning base so humans and Codex understand the project.

### Deliverables

```text
README.md
docs/VISION.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/CODEX_TASKS.md
docs/API_NOTES.md
docs/LEGAL_AND_BRANDING.md
docs/SECURITY.md
```

### Must include

- Product definition.
- Non-goals.
- Architecture.
- Why Suwayomi backend.
- Why browser cannot run APK extensions.
- Keiyoushi repo metadata role.
- Phase roadmap.
- MVP definition.
- Public safety rules.

### Definition of done

```text
A senior engineer can read the docs and understand what is being built.
Codex has a clear task list.
No app code yet.
```

---

## Phase 1 — Web app shell

### Goal

Create the frontend base and navigation.

### Deliverables

```text
React + TypeScript + Vite app
Tailwind configured
Router configured
Base layout
Responsive bottom nav/sidebar
Dark theme
Core route shells
```

### Routes

```text
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

### Definition of done

```text
App runs locally.
Routes work.
UI shell looks serious.
No backend integration yet.
No fake feature claims.
```

---

## Phase 2 — Settings and server connection

### Goal

Let user configure Suwayomi Server.

### Deliverables

- Server URL setting.
- Persistent settings storage.
- GraphQL endpoint derivation.
- Test connection button.
- Connected/disconnected state.
- Friendly error messages.

### Definition of done

```text
User can enter backend URL.
App can test GraphQL reachability.
Disconnected state is graceful.
```

---

## Phase 3 — GraphQL schema and typed API layer

### Goal

Build API layer correctly from real schema.

### Deliverables

- Schema introspection instructions.
- GraphQL client.
- Generated types if possible.
- First basic query.
- API error handling.
- Query key conventions.

### Definition of done

```text
No hallucinated API names.
GraphQL calls are typed or strongly wrapped.
Build passes.
```

---

## Phase 4 — Library flow

### Goal

Display real user library.

### Deliverables

- Library query.
- Manga card grid.
- Search.
- Sort.
- Category filter if available.
- Loading/error/empty states.

### Definition of done

```text
Real library appears from Suwayomi.
Clicking manga opens details page.
```

---

## Phase 5 — Manga detail flow

### Goal

Show metadata and chapter list.

### Deliverables

- Manga detail query.
- Cover/title/description/source/status.
- Chapter list.
- Read/download indicators if available.
- Continue reading button.
- Open chapter action.

### Definition of done

```text
User can open a manga and select a chapter.
```

---

## Phase 6 — Reader V1

### Goal

End-to-end reading.

### Deliverables

- Fetch chapter pages.
- Single page mode.
- Vertical webtoon mode.
- LTR/RTL direction.
- Page preloading.
- Progress save.
- Next/previous chapter.
- Keyboard shortcuts.
- Mobile tap zones.
- Fullscreen option.

### Definition of done

```text
Library → Manga → Chapter → Reader works with real backend data.
Reader is usable on phone and desktop.
```

---

## Phase 7 — Browse sources and search

### Goal

Discover manga through installed backend sources.

### Deliverables

- Installed sources page.
- Search source.
- Search results.
- Open manga result.
- Add to library if API supports.

### Definition of done

```text
User can search an installed source and add/read manga.
```

---

## Phase 8 — Extension repo management UI

### Goal

Implement Mihon-like extension repo management.

### Deliverables

- Add repo URL.
- Repo list.
- Repo card with name/status/actions.
- Refresh repo.
- Copy URL.
- Delete repo.
- Keiyoushi preset helper.
- Safe URL validation.
- Repo fetch errors.

### Definition of done

```text
User can add Keiyoushi index URL and see repo status.
Bad URLs fail safely.
```

---

## Phase 9 — Extension catalog parser and UI

### Goal

Display extension catalog metadata.

### Deliverables

- Parse index.min.json.
- Extension card/list.
- Search by name/source/package.
- Filter by language.
- NSFW toggle.
- Installed/update status placeholder if backend state not connected.
- Extension detail drawer.

### Definition of done

```text
Keiyoushi catalog appears.
NSFW toggle works.
No browser APK execution attempted.
```

---

## Phase 10 — Extension install/update integration

### Goal

Wire extension actions to backend if API supports.

### Deliverables

- Inspect actual Suwayomi extension APIs.
- Installed status.
- Install action.
- Update action.
- Uninstall action.
- Progress/error state.
- Refresh installed sources after install.

### Definition of done

```text
User can manage backend extensions from our web UI.
If API lacks a capability, UI says unsupported instead of faking.
```

---

## Phase 11 — Updates and history

### Goal

Implement Mihon-like daily usage pages.

### Deliverables

- Updates page.
- History page.
- Continue reading from history.
- Open chapter from updates.
- Group by date.
- Loading/error states.

### Definition of done

```text
User can resume reading and see recent updates.
```

---

## Phase 12 — Downloads UI

### Goal

Expose backend download system.

### Deliverables

- Download queue.
- Downloaded chapter indicator.
- Start/cancel/retry/delete if supported.
- Download status in manga/chapter lists.
- Storage info if available.

### Definition of done

```text
User can manage downloads without opening default Suwayomi UI.
```

---

## Phase 13 — Backup/restore UI

### Goal

Expose backup workflow.

### Deliverables

- Create backup.
- Restore backup.
- Backup status/errors.
- Explain compatibility.
- Warn before destructive restore.

### Definition of done

```text
User can perform backup/restore from our app if backend exposes it.
```

---

## Phase 14 — PWA hardening

### Goal

Make it installable and reliable.

### Deliverables

- Web manifest.
- Icons.
- Service worker.
- App shell caching.
- Offline backend page.
- Install prompt support if desired.

### Definition of done

```text
App can be installed as PWA.
App shell opens even if network is unstable.
```

---

## Phase 15 — Public beta hardening

### Goal

Make it safe for GitHub/public users.

### Deliverables

- README polished.
- Setup docs.
- Screenshots.
- Legal disclaimer.
- Security policy.
- Contribution guide.
- Issue templates.
- Dependency audit.
- License review.
- No Mihon branding misuse.
- No telemetry by default.

### Definition of done

```text
Project can be published publicly without looking irresponsible.
```

---

## Phase 16 — Beast mode

### Goal

Make the project memorable.

Possible features:

- Superior reader UX compared to existing web UIs.
- Smooth webtoon virtualized reader.
- Multi-server profiles.
- Local CBZ/CBR/PDF import.
- Tauri desktop wrapper.
- Android ↔ web sync guides.
- Advanced keyboard-first desktop mode.
- Reading analytics.
- Theme marketplace.
- Better extension manager than current ecosystem.
- Offline browser-side cache with explicit user control.

---

## 25. Codex workflow

### 25.1 Never give Codex this prompt

```text
Clone Mihon and make a web app.
```

### 25.2 Good Codex prompt format

Every Codex task should include:

```text
Context
Goal
Files allowed to touch
Files not allowed to touch
Implementation details
Definition of done
Commands to run
What not to do
```

### 25.3 Codex task size rule

Good task size:

```text
1 route
or
1 module
or
1 data flow
or
1 parser
or
1 UI component group
```

Bad task size:

```text
Build all Mihon features.
```

### 25.4 Review rule

After every Codex task:

```text
Run app.
Run typecheck.
Run tests.
Read diff.
Remove fake shortcuts.
Commit.
```

### 25.5 Branch naming

```text
phase-0-docs
phase-1-shell
phase-2-server-settings
phase-3-graphql-layer
phase-4-library
phase-5-manga-detail
phase-6-reader-v1
phase-8-extension-repos
```

---

## 26. Initial Codex prompt

Use this exact prompt first:

```text
We are building a public-quality Mihon-inspired web/PWA manga and comic reader.

This is NOT an official Mihon project.
Do NOT port Mihon Android/Kotlin code directly.
Do NOT attempt to run Android APK extensions in the browser.
Do NOT implement scraping in the frontend.
Do NOT fake completed backend features.

Architecture:
- Frontend: React + TypeScript + Vite + Tailwind.
- Backend: Suwayomi Server first.
- API: Suwayomi GraphQL at /api/graphql.
- Extension repos such as Keiyoushi index.min.json are catalog metadata only.
- Actual extension install/run/search/fetch happens through Suwayomi Server.

Create only the initial repository structure and planning docs.

Deliver:
1. README.md
2. docs/VISION.md
3. docs/ARCHITECTURE.md
4. docs/ROADMAP.md
5. docs/CODEX_TASKS.md
6. docs/API_NOTES.md
7. docs/LEGAL_AND_BRANDING.md
8. docs/SECURITY.md

The docs must explain:
- What we are making
- What we are not making
- Why we use Suwayomi backend
- Why browser cannot directly run Mihon/Tachiyomi APK extensions
- How Keiyoushi repo index will be used
- Phase-by-phase roadmap
- MVP definition
- Public release safety rules

Do not write app code yet.
```

---

## 27. Follow-up Codex prompts by phase

### Task 001 — Scaffold web app

```text
Create a React + TypeScript + Vite + Tailwind frontend.

Do not connect to backend yet.
Do not implement fake manga functionality.

Create:
- base app shell
- router
- dark theme
- bottom navigation for mobile
- sidebar navigation for desktop
- route shells:
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

Definition of done:
- pnpm install works
- pnpm dev works
- pnpm build works
- navigation works
- no mock backend claims
```

### Task 002 — Server settings

```text
Implement server settings.

Add:
- server URL input
- save/reset
- derive GraphQL endpoint as /api/graphql
- connection test button
- connected/disconnected/error states
- persisted settings storage

Do not implement library queries yet.

Definition of done:
- user can set server URL
- setting persists after refresh
- failed connection shows helpful error
```

### Task 003 — GraphQL API layer

```text
Implement the GraphQL API layer for Suwayomi.

First inspect the real GraphQL schema from a running Suwayomi Server.
Do not hallucinate query names.

Add:
- GraphQL client
- typed wrappers
- API error classes
- connection test query
- docs/API_NOTES.md updates with discovered schema details

Definition of done:
- connection test uses real GraphQL
- build passes
- API notes document exact queries used
```

### Task 004 — Library page

```text
Implement real library page using Suwayomi GraphQL.

Add:
- library query
- manga card grid
- loading/error/empty states
- search/filter/sort where data supports it
- clicking manga opens /manga/:mangaId

Do not use mock data unless VITE_MOCK_MODE=true.

Definition of done:
- real library loads from backend
- page handles backend offline gracefully
```

### Task 005 — Manga detail

```text
Implement manga detail page.

Add:
- manga metadata
- cover
- description
- source/status
- chapter list
- read/download indicators if available
- continue reading
- open chapter in /reader/:chapterId

Definition of done:
- user can open real manga and select real chapter
```

### Task 006 — Reader V1

```text
Implement reader V1.

Add:
- fetch chapter pages from backend
- single-page mode
- vertical webtoon mode
- LTR/RTL navigation
- next/previous page
- page preloading
- progress saving if API supports
- keyboard shortcuts
- mobile tap zones
- image error retry

Definition of done:
- user can read a chapter end-to-end
- reader works on mobile and desktop
```

### Task 007 — Extension repo management

```text
Implement Extension Repos page inspired by Mihon.

Add:
- add repo URL
- repo list
- refresh repo
- delete repo
- copy repo URL
- Keiyoushi preset helper for:
  https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json
- URL validation
- fetch status and errors

Do not attempt to install APKs in browser.

Definition of done:
- Keiyoushi repo can be added and refreshed
- invalid repo fails safely
```

### Task 008 — Extension catalog parser

```text
Implement extension catalog parser and UI.

Use the repo index JSON as metadata only.

Add:
- parser for index.min.json shape
- extension list
- search by extension/source/package
- filter by language
- NSFW visibility setting
- extension detail drawer
- parser tests using saved fixture

Do not execute extension code.

Definition of done:
- Keiyoushi catalog displays correctly
- NSFW toggle hides/shows flagged entries
- parser has unit tests
```

### Task 009 — Browse/search sources

```text
Implement source browsing/search through Suwayomi.

Inspect GraphQL schema first.

Add:
- installed sources page
- source search
- manga search results
- open result detail
- add to library if API supports

Definition of done:
- user can search installed source and add/open manga
```

### Task 010 — Downloads UI

```text
Implement downloads UI using backend state.

Add:
- download queue page/section
- status badges in chapter list
- start/cancel/retry/delete if API supports
- graceful unsupported states

Definition of done:
- user can see and manage backend downloads where supported
```

---

## 28. Definition of done for the full MVP

MVP is complete when:

```text
1. User can set Suwayomi server URL.
2. App connects to /api/graphql.
3. User sees real library.
4. User opens real manga detail page.
5. User opens real chapter.
6. Reader loads real pages.
7. Reader saves progress if backend supports it.
8. User can manage extension repo URLs.
9. Keiyoushi repo index can be fetched and displayed as metadata.
10. App does not pretend browser can run APK extensions.
11. Build passes.
12. Basic tests pass.
13. README explains setup and limitations.
14. Project has legal/branding disclaimer.
```

---

## 29. What senior engineers will judge

A senior engineer will not be impressed by:

- Pretty mock screens only.
- Random cloned Mihon UI.
- No backend architecture.
- Fake extension install.
- Broken reader.
- No error handling.
- No security thought.
- No setup docs.

They may respect:

- Clear architecture boundaries.
- Correct use of Suwayomi as backend.
- Clean frontend state management.
- Good reader performance.
- Strong extension repo parser.
- Helpful errors.
- Good docs.
- Safe public positioning.
- Phased development.
- Real end-to-end flow.

---

## 30. Risk register

| Risk | Severity | Why | Mitigation |
|---|---:|---|---|
| Codex tries Android-to-web port | High | Creates cursed codebase | Start with docs and fresh frontend |
| Suwayomi GraphQL differs from assumptions | High | Queries break | Schema introspection before implementation |
| Extension install APIs incomplete | Medium/High | UI cannot manage installs | Show unsupported states; contribute upstream later |
| CORS issues | Medium | Local backend/frontend mismatch | Docs + friendly errors |
| Reader performance bad | High | Core UX fails | Lazy loading/virtualization |
| Legal/branding confusion | High | Public project risk | Original name, disclaimers, no content hosting |
| Mock mode leaks into production | Medium | Fake product | Clear flag and visible banner |
| Huge extension repo JSON | Medium | Browser slow | Size limits, caching, worker parser later |
| NSFW metadata incorrect | Medium | User safety issue | Warning, toggle, do not overclaim |
| Backend offline common | Medium | User confusion | Disconnected mode and setup guide |
| Trying to build everything at once | High | Project dies | Phase-based tasks |

---

## 31. Open questions

These must be answered during development.

### Product

- What is the final app name?
- Should Keiyoushi be a preset or manually added only?
- Should app default to `/library` or onboarding if no server URL?
- Should we support mock demo publicly?

### Backend/API

- Which Suwayomi version do we target first?
- What exact GraphQL queries/mutations exist for:
  - library
  - manga detail
  - chapters
  - pages
  - sources
  - extension install/update
  - downloads
  - backups
- Is extension repo management exposed through Suwayomi API or only extension install?
- What authentication/security does remote Suwayomi setup require?

### Reader

- Which mode is default?
- How often should progress save?
- How to handle very long webtoon chapters?
- Should image requests go directly to backend URLs or through API wrappers?

### Public release

- Which license for our project?
- What name/logo?
- What disclaimers exactly?
- Do we accept extension-related issues or redirect them to repo/source maintainers?

---

## 32. Project name

Chosen name:

```text
Yomikura
```

Criteria:

- Not Mihon/Tachiyomi/Suwayomi confusing.
- Searchable.
- Good logo potential.
- Not already a big app.
- Does not imply content hosting.

---

## 33. Public README skeleton

```md
# Yomikura

A web/PWA client for Suwayomi-compatible manga and comic libraries.

## What this is

Yomikura is an independent web reader interface. It connects to your own Suwayomi Server and provides a polished library, browse, extension repo, and reader experience.

## What this is not

- Not an official Mihon project.
- Not an official Tachiyomi project.
- Not an official Suwayomi project.
- Not a content hosting service.
- Does not ship manga/comic content.
- Does not run Android APK extensions in the browser.

## Requirements

- Node.js
- pnpm
- A running Suwayomi Server

## Setup

...

## Extension repositories

Extension repository indexes such as Keiyoushi's `index.min.json` are used as metadata catalogs. Actual extension execution is handled by Suwayomi Server.

## Disclaimer

This project is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. This app hosts zero content.
```

---

## 34. Local development setup draft

Expected commands eventually:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
```

Optional Suwayomi setup docs should include:

```text
1. Install/run Suwayomi Server.
2. Open default WebUI once to confirm server works.
3. Add extension repo/source through supported flow.
4. Open our app.
5. Set server URL.
6. Test connection.
```

Do not hardcode exact Suwayomi install commands until verified against current docs/releases.

---

## 35. Quality bar

This project is serious only if:

```text
- Real backend integration works.
- Reader is smooth.
- Mobile UX is excellent.
- Extension repo UI is honest and useful.
- Docs are clear.
- No fake complete features.
- Public positioning is safe.
- Codebase is modular.
```

This project is mid if:

```text
- It is just Mihon-looking screens.
- It has mock manga forever.
- It cannot read real chapters.
- It tries to do everything and finishes nothing.
- It ignores backend/API reality.
```

---

## 36. Final architecture decision

The architecture is locked as:

```text
Frontend:
  React + TypeScript + Vite + Tailwind PWA

Backend:
  Suwayomi Server first

Extension repos:
  Keiyoushi and others are metadata catalogs in frontend
  Actual install/run is backend-owned

Mihon:
  UX/reference only
  No direct Android-to-web port

Public mode:
  Self-hosted / bring-your-own-server
  No content hosting
```

---

## 37. Next immediate action

Do this next:

```text
1. Choose temporary repo name.
2. Create GitHub repo.
3. Add this blueprint as docs/PROJECT_BLUEPRINT.md.
4. Give Codex the Phase 0 prompt.
5. Review docs.
6. Only then let Codex scaffold the app.
```

Do not start from code.

Start from architecture.
