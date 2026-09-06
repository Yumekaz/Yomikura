# Yomikura

Yomikura is an independent Suwayomi client for manga and comic libraries — **one codebase, two ways to run it:**

- **Web / PWA** — self-host or open in any modern browser
- **Desktop** — native Windows, macOS, and Linux app (Tauri)

Inspired by the design and feel of Mihon.

> [!IMPORTANT]
> **Legal Disclaimer & Project Status**
> - **Yomikura is a client, not a content host.** It does not host, mirror, stream, or distribute copyrighted manga, comics, or media.
> - **Zero extensions bundled.** Scraping extensions and repository indexes are user-configured on Suwayomi Server—not shipped by Yomikura.
> - **Web/PWA:** Connect to your own [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) URL.
> - **Desktop (Tauri):** Can connect to a remote server **or** optionally download and run Suwayomi Server + JRE locally on your machine. Content fetching still happens inside Suwayomi, not Yomikura.
> - **No Affiliation.** Independent project—not endorsed by Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any publisher.

---

## What Yomikura Is

- A clean **web, PWA, and desktop** client for a user-controlled Suwayomi backend.
- A Mihon/Tachiyomi-inspired library and reader experience on desktop, tablet, and mobile.
- A private, local-first app — settings and offline chapters stay on **your device** (browser storage or desktop data folder).

## What Yomikura Is Not

- **Not a manga hosting service.** It contains no media, links, or pirate indexes.
- **Not a scraping proxy.** The frontend does not make connections to content providers; it operates solely through your backend server's APIs.
- **Not an APK runtime.** Yomikura does not run Android extensions in the browser. It only parses repository indexes to let users trigger backend-side extension updates.

---

## Getting Started

### Desktop app (recommended for most users)

1. Download the installer for your OS from **[GitHub Releases](https://github.com/Yumekaz/Yomikura/releases)**.
2. Launch Yomikura — onboarding will guide you through storage location, optional JRE + Suwayomi download, and first connection.
3. Add extension repositories and sources in **Extensions** / **Browse** (user-configured; nothing bundled).

Yomikura is an independent open-source project applying to the [SignPath Foundation](https://signpath.org/) for free Windows code signing. Until that application is approved and the workflow is enabled, release installers are unsigned.

### Web / PWA

Host the built `dist/` folder or run locally. You need a Suwayomi server URL (your own instance or LAN). Default:
```text
http://127.0.0.1:4567
```

### Development

```bash
pnpm install
pnpm dev          # web UI at http://localhost:5173
pnpm build        # production web build
pnpm tauri dev    # desktop shell + web UI (requires Rust)
pnpm run verify-desktop   # quick local readiness check
```

---

## Technology Stack

- **UI:** React + TypeScript + Vite
- **Desktop:** Tauri 2 (Windows, macOS, Linux)
- **Styling:** Vanilla CSS + Tailwind CSS
- **State:** Zustand + TanStack Query + `graphql-request`
- **Offline:** IndexedDB (web) / local files (desktop) + optional Suwayomi downloads

---

## Project Documentation

Explore our detailed architectural and design specifications:
- [Vision & Goals](docs/VISION.md) - Product definition and core features.
- [Architecture & Flow](docs/ARCHITECTURE.md) - System boundary diagram and client/server ownership map.
- [API Specifications](docs/API_NOTES.md) - Suwayomi Server GraphQL schemas and queries implemented.
- [Project Blueprint](docs/PROJECT_BLUEPRINT.md) - Engineering specs and security constraints.
- [Security & Trust](docs/SECURITY.md) - Local data storage rules and CORS policies.
- [Roadmap & Milestones](docs/ROADMAP.md) - Shipped milestones (web, PWA, desktop) and what's next.
- [Legal & Branding Guidelines](docs/LEGAL_AND_BRANDING.md) - Compliance policies and identity naming.
- [Release readiness](docs/RELEASE_READINESS.md) - Validation gates for installers and public releases.
- [Installation and system requirements](docs/SYSTEM_REQUIREMENTS.md) - Supported platforms, storage, and safe installation.
- [Known issues](docs/KNOWN_ISSUES.md) - Current signing, first-launch, source, and platform limitations.
- [Privacy](PRIVACY.md) - Exact local storage, network, and deletion behavior.
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Plain-language recovery steps for common problems.

---

## License & Compliance

Yomikura is built with a strong commitment to open-source compliance, user privacy, and legal safety:
- **License:** [MIT License](LICENSE) for Yomikura UI/shell code.
- **Third-Party:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — Suwayomi Server (MPL-2.0), Temurin JRE, Tauri.
- **Terms of Service:** [TERMS.md](TERMS.md)
- **Privacy Policy:** [PRIVACY.md](PRIVACY.md) — local-first, zero project telemetry.
- **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines. We do not accept contributions containing scraping logic, bypasses, or copyrighted assets.
- **DMCA Policy:** We take copyright compliance seriously. For our notice and takedown procedure, see [DMCA.md](DMCA.md).
