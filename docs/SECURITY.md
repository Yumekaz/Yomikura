# Security & Trust Boundaries

Yomikura is a client shell (browser, PWA, or Tauri desktop). This document outlines trust boundaries and data policies.

## Trust Boundaries

1. **Yomikura UI (MIT):** Rendering, reader UX, local preferences, optional desktop onboarding (storage picker, updater UI).
2. **Suwayomi Server (MPL-2.0):** Extension execution, catalog access, library database, downloads, progress. Runs locally in desktop mode or on a server you configure.
3. **Extension repositories (user-added):** Third-party JSON indexes; parsed by Suwayomi when the user adds URLs.

The Yomikura UI does not execute extension APKs or scrape content providers directly.

## Connection Security

- Accepts `http://localhost`, LAN IPs, or HTTPS for Suwayomi URLs. Explicitly rejects unsupported schemes, embedded credentials, query strings, and fragments before connection testing.
- CORS guidance for web mode when the UI and server origins differ.
- NSFW metadata filtering based on extension index flags.

## Data Storage

| Data | Location |
|------|----------|
| UI settings | Browser storage or desktop app persisted state |
| Offline chapter cache | IndexedDB / local files |
| Library & extensions | Suwayomi data directory (desktop) or remote server |

**No Yomikura project telemetry.** Server profiles and reading data stay on your devices/servers.

## Desktop-Specific Notes

- Local Suwayomi binds to loopback by default during onboarding.
- JRE and Suwayomi JAR downloads use HTTPS to official release endpoints.
- Users choose the data directory; portable mode stores data beside the app.
