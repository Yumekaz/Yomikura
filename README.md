# Yomikura

Your next chapter has a home. Yomikura is a free, open-source manga and comic reader for your Suwayomi library.

**[Visit the reading room](https://yumekaz.github.io/Yomikura/)** · **[Download the desktop app](https://yumekaz.github.io/Yomikura/#get-started)** · **[Browser setup guide](https://yumekaz.github.io/Yomikura/setup/)** · **[Try the demo](https://yumekaz.github.io/Yomikura/app/#/library)**

![Yomikura's reading spirit in a lantern-lit library](website/assets/hero-night.webp)

## Start reading

**Desktop is the easiest way.** Download an installer from the [public homepage](https://yumekaz.github.io/Yomikura/#get-started), open Yomikura and choose **Set up my library**. Guided setup prepares Java and Suwayomi when needed. You don't need Git, Node.js or Rust to install the app.

**Prefer your browser?** The [visual browser guide](https://yumekaz.github.io/Yomikura/setup/) provides prebuilt web files and explains how standalone Suwayomi can serve Yomikura itself. No cloning or separate frontend web server is required. Follow the guide before replacing any existing web interface, and keep your library data intact.

**Just curious?** [Explore two original illustrated demo stories](https://yumekaz.github.io/Yomikura/app/#/library), with no server or account needed.

The homepage labels the current public beta and previous stable release separately, lists the available platform architectures, and links the tested limitations. Windows installers are not yet publisher-signed; interactive macOS/Linux testing has separate coverage limits.

Yomikura is an independent project inspired by the design and feel of Mihon. Desktop and browser versions share the React/TypeScript reader; Suwayomi owns library data, source execution and server downloads.

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
3. Add a trusted Extension Store in **Extensions → Stores**, verify its publisher and signing key, then install sources in **Browse** (user-configured; nothing bundled).

The local Suwayomi engine stays in the background; Yomikura disables Suwayomi's separate fallback browser window for managed storage.

Yomikura is an independent open-source project applying to the [SignPath Foundation](https://signpath.org/) for free Windows code signing. Until that application is approved and the workflow is enabled, release installers are unsigned.

### Web / PWA

Start with the [public visual browser guide](https://yumekaz.github.io/Yomikura/setup/). It explains installing standalone Suwayomi, choosing its Custom WebUI flavor, preserving the existing interface and installing Yomikura's prebuilt browser files. The download has `index.html` and `assets` directly at the archive root, so no frontend compilation is needed.

You need a reachable Suwayomi server URL (your own instance or LAN); a browser cannot start the desktop local engine for you. The usual address on the server's own computer is:
```text
http://127.0.0.1:4567
```

Website chapter downloads are managed by the connected Suwayomi server. Desktop additionally creates a verified local offline cache.

### Development

The source workflow below is for contributors. Ordinary readers can use the desktop installer or prebuilt web download above.

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
- [Local reliability status](docs/RELIABILITY_STATUS_2026-10-24.md) - Implemented audit findings, verification evidence, and remaining work.
- [Public beta guide](docs/BETA_TESTING.md) - Safe tester journeys and privacy-preserving feedback.
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
