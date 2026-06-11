# Third-Party Notices

Yomikura (MIT License) may integrate with or download the following third-party software at runtime. **Yomikura does not claim ownership of these components.**

---

## Suwayomi Server

- **Project:** [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server)
- **License:** Mozilla Public License 2.0 (MPL-2.0)
- **Role:** Optional local manga/comic library backend. In desktop mode, Yomikura can download and run an unmodified Suwayomi Server JAR on the user's machine. Extension execution, catalog fetching, and downloads are performed by Suwayomi—not by Yomikura.
- **Source:** https://github.com/Suwayomi/Suwayomi-Server

Yomikura is a separate application (a "Larger Work" under MPL-2.0). The Yomikura UI shell remains licensed under MIT. Suwayomi Server retains its own license and copyright.

---

## Eclipse Temurin JRE (optional)

- **Project:** [Eclipse Adoptium / Temurin](https://adoptium.net/)
- **License:** GPL-2.0 with Classpath Exception (typical for Temurin builds)
- **Role:** Desktop onboarding may download a Java runtime so Suwayomi Server can start locally. Downloaded only to the user's chosen data directory—not bundled as Yomikura source code.

---

## Tauri & Rust ecosystem

- **Project:** [Tauri](https://tauri.app/)
- **License:** Apache-2.0 OR MIT (per component; see Tauri release notices)
- **Role:** Native desktop shell wrapping the Yomikura web UI.

---

## User-configured extension repositories

Extension indexes (e.g. community repository JSON catalogs) are **not** shipped with Yomikura. Users who add repository URLs are responsible for compliance with those hosts' terms and applicable law.

---

*For Yomikura's own license, see [LICENSE](LICENSE). For legal disclaimers, see [TERMS.md](TERMS.md) and [docs/LEGAL_AND_BRANDING.md](docs/LEGAL_AND_BRANDING.md).*