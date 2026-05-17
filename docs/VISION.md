# Vision

Yomikura is a self-hosted web/PWA reader interface for Suwayomi-compatible manga and comic libraries.

The project is inspired by the quality bar and reading workflows people expect from Mihon and Tachiyomi, but it is not a port of either app. The browser frontend should be built fresh around web constraints, PWA ergonomics, and a clear backend boundary.

## Product Promise

Yomikura should feel like a serious personal reading app:

- fast on phone, tablet, and desktop
- installable as a PWA
- comfortable for long reading sessions
- honest about backend requirements
- clean enough for public GitHub review
- polished enough that the first screen does not look like a generated template

The core promise is not "free manga." The promise is a better self-hosted interface for a library the user controls through Suwayomi.

## MVP

The first real MVP is:

```text
Connect to Suwayomi
-> load real library
-> open manga details
-> open chapter
-> read chapter pages
-> manage extension repository metadata
```

Anything that does not touch a real backend must be clearly labeled as a shell, placeholder, or mock mode.

## First Page Product Direction

The first page should open directly into the app when a known Suwayomi server is available.

During local development, Yomikura may default to:

```text
http://127.0.0.1:4567
```

Connection setup should live in Settings or a compact fallback state. The app should route to `/library` by default, show precise retryable errors when Suwayomi is unreachable, and guide users to Settings only when the server URL actually needs attention.

The design should feel dark, quiet, reader-first, and premium. It should avoid fake metrics, huge gradients, bento-card filler, copyrighted-looking manga art, "free manga" copy, and decorative noise.

## Success Criteria

Yomikura is worth building if it becomes:

- a clean Suwayomi client that real users can run
- a better reader experience than a quick default web UI clone
- honest about legal, source, extension, and backend boundaries
- modular enough that contributors can work phase by phase
- demoable without pretending to host or provide content

## Non-Goals

- Do not directly port Mihon Android/Kotlin code.
- Do not run Android APK extensions in browser.
- Do not scrape sources in frontend code.
- Do not host content.
- Do not ship source repositories as a content promise.
- Do not claim official affiliation with Mihon, Tachiyomi, Suwayomi, or Keiyoushi.
