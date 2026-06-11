# Yomikura

Yomikura is an independent, self-hosted web and PWA frontend client for Suwayomi-compatible manga and comic libraries, inspired by the design and user experience of Mihon.

> [!IMPORTANT]
> **Legal Disclaimer & Project Status**
> - **Yomikura is a client, not a content host.** It does not host, mirror, stream, or distribute copyrighted manga, comics, or media.
> - **Zero extensions bundled.** Scraping extensions and repository indexes are user-configured on Suwayomi Server—not shipped by Yomikura.
> - **Web/PWA:** Connect to your own [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) URL.
> - **Desktop (Tauri):** Can connect to a remote server **or** optionally download and run Suwayomi Server + JRE locally on your machine. Content fetching still happens inside Suwayomi, not Yomikura.
> - **No Affiliation.** Independent project—not endorsed by Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any publisher.

---

## What Yomikura Is

- A clean web/PWA/desktop client for a user-controlled Suwayomi-compatible backend.
- A Mihon/Tachiyomi-inspired library browsing and reading experience optimized for desktop, tablet, and mobile browsers.
- A private, local-first application where all server profiles, settings, and downloaded chapters are cached locally in your browser storage.

## What Yomikura Is Not

- **Not a manga hosting service.** It contains no media, links, or pirate indexes.
- **Not a scraping proxy.** The frontend does not make connections to content providers; it operates solely through your backend server's APIs.
- **Not an APK runtime.** Yomikura does not run Android extensions in the browser. It only parses repository indexes to let users trigger backend-side extension updates.

---

## Getting Started

### Prerequisites
To use Yomikura, you need a running instance of a Suwayomi-compatible backend. By default, Yomikura connects to:
```text
http://127.0.0.1:4567
```

### Local Development
To spin up the web client locally:
```bash
pnpm install
pnpm dev
pnpm build
```

---

## Technology Stack

- **Framework:** React + TypeScript + Vite
- **Styling:** Vanilla CSS + Tailwind CSS
- **State & Caching:** Zustand + TanStack Query + `graphql-request`
- **Offline Storage:** IndexedDB (via Cache Storage APIs)

---

## Project Documentation

Explore our detailed architectural and design specifications:
- [Vision & Goals](docs/VISION.md) - Product definition and core features.
- [Architecture & Flow](docs/ARCHITECTURE.md) - System boundary diagram and client/server ownership map.
- [API Specifications](docs/API_NOTES.md) - Suwayomi Server GraphQL schemas and queries implemented.
- [Project Blueprint](docs/PROJECT_BLUEPRINT.md) - Engineering specs and security constraints.
- [Security & Trust](docs/SECURITY.md) - Local data storage rules and CORS policies.
- [Roadmap & Milestones](docs/ROADMAP.md) - Log of completed milestones and future Tauri/Local File features.
- [Legal & Branding Guidelines](docs/LEGAL_AND_BRANDING.md) - Compliance policies and identity naming.

---

## License & Compliance

Yomikura is built with a strong commitment to open-source compliance, user privacy, and legal safety:
- **License:** [MIT License](LICENSE) for Yomikura UI/shell code.
- **Third-Party:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — Suwayomi Server (MPL-2.0), Temurin JRE, Tauri.
- **Terms of Service:** [TERMS.md](TERMS.md)
- **Privacy Policy:** [PRIVACY.md](PRIVACY.md) — local-first, zero project telemetry.
- **Contributing:** See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines. We do not accept contributions containing scraping logic, bypasses, or copyrighted assets.
- **DMCA Policy:** We take copyright compliance seriously. For our notice and takedown procedure, see [DMCA.md](DMCA.md).
