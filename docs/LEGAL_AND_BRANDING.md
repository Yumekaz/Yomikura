# Legal and Branding Guidelines

Yomikura is an independent, open-source client for Suwayomi-compatible manga and comic libraries (web, PWA, and desktop).

## Naming & Identity

The project name is **Yomikura**—chosen to avoid confusion with Mihon, Tachiyomi, Suwayomi, or Keiyoushi.

- Does not imply official affiliation with content providers or upstream readers.
- Does not suggest the app hosts or distributes copyrighted content.

## Legal Disclaimer

Displayed in Settings → About and public documentation:

> Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. The project does not operate a third-party comic catalogue or content proxy. The public demo uses original generated illustrations. Users configure their own sources and repositories. Desktop setup can download and run Suwayomi locally; source execution belongs to Suwayomi, and the client displays and may save the pages it returns.

## Architecture & Liability Boundaries

| Layer | Responsibility |
|-------|----------------|
| **Yomikura UI** (MIT) | Layout, reader, settings, local preferences |
| **Suwayomi Server** (MPL-2.0) | Extensions, scraping, library DB, downloads |
| **Extension repos** (user-added) | Third-party catalog metadata |

- **Project assets:** Original generated demo pages, covers and identity illustrations are shipped, with provenance in `public/demo/README.md`, `public/identity/README.md` and `website/assets/artwork-prompts.json`. No third-party comic catalogue or source extension is bundled.
- **No scraping in the UI:** Suwayomi executes sources; the client additionally makes the setup/update requests described in [Privacy](../PRIVACY.md).
- **Desktop convenience ≠ distribution:** Downloading Suwayomi JAR on first launch is an optional local setup step, not Yomikura hosting content.

## Extension Registry Boundary

Yomikura does not execute Android APK extensions. It may display extension metadata from indexes the user configures; installation runs on Suwayomi Server.

## Third-Party Licenses

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for Suwayomi Server, Temurin JRE, and Tauri attribution.

## Copyright Compliance in Repo Assets

Public screenshots and demo mode use the project's original generated illustrations. Do not publish private reader screenshots or third-party comic art without appropriate permission. See [copyright concerns](../DMCA.md), [third-party notices](../THIRD_PARTY_NOTICES.md) and [contribution rules](../CONTRIBUTING.md).
