# Legal and Branding Guidelines

Yomikura is an independent, open-source client for Suwayomi-compatible manga and comic libraries (web, PWA, and desktop).

## Naming & Identity

The project name is **Yomikura**—chosen to avoid confusion with Mihon, Tachiyomi, Suwayomi, or Keiyoushi.

- Does not imply official affiliation with content providers or upstream readers.
- Does not suggest the app hosts or distributes copyrighted content.

## Legal Disclaimer

Displayed in Settings → About and public documentation:

> Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. This app hosts zero manga or comic content. Users are responsible for configuring their own sources and repositories. In desktop mode, Yomikura may download and run Suwayomi Server locally on the user's machine; extension execution and content fetching remain Suwayomi's responsibility.

## Architecture & Liability Boundaries

| Layer | Responsibility |
|-------|----------------|
| **Yomikura UI** (MIT) | Layout, reader, settings, local preferences |
| **Suwayomi Server** (MPL-2.0) | Extensions, scraping, library DB, downloads |
| **Extension repos** (user-added) | Third-party catalog metadata |

- **Zero content hosting:** Yomikura ships no manga pages, covers, or catalogs.
- **No scraping in the UI:** The frontend only calls Suwayomi GraphQL/HTTP APIs.
- **Desktop convenience ≠ distribution:** Downloading Suwayomi JAR on first launch is an optional local setup step, not Yomikura hosting content.

## Extension Registry Boundary

Yomikura does not execute Android APK extensions. It may display extension metadata from indexes the user configures; installation runs on Suwayomi Server.

## Third-Party Licenses

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for Suwayomi Server, Temurin JRE, and Tauri attribution.

## Copyright Compliance in Repo Assets

Screenshots and demo mode use synthetic or public-domain placeholders—no bundled copyrighted manga art.