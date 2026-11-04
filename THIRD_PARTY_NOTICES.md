# Third-Party Notices

Yomikura (MIT License) may integrate with or download the following third-party software at runtime. **Yomikura does not claim ownership of these components.**

Production builds include the installed runtime JavaScript/UI/font packages' full license texts in `licenses/THIRD_PARTY_NPM.txt`, generated from their actual package files. This includes React, React DOM, React Router, TanStack Query, Zustand, GraphQL, Lucide, Radix and their installed runtime dependencies. The public website also serves these [runtime license notices](https://yumekaz.github.io/Yomikura/assets/licenses/THIRD_PARTY_NPM.txt) for its demo. These notices supplement the native and downloaded-component information below; existing older installers do not gain new files retroactively.

`react-remove-scroll-bar@2.3.8` declares MIT in its npm metadata but omits the license file from the npm archive. Its author's upstream [MIT license at pinned commit 8ca9ba5](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE) is retained in `public/licenses/react-remove-scroll-bar-MIT.txt` and included as a documented supplement. The historical npm gitHead could not be resolved upstream; this is not represented as a license file extracted from that archive.

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

## Typefaces

- **Inter Variable:** Rasmus Andersson and contributors, SIL Open Font License 1.1. Packaged license: `public/licenses/inter-OFL.txt`.
- **Playfair Display Variable:** Claus Eggers Sorensen and contributors, SIL Open Font License 1.1. Packaged license: `public/licenses/playfair-display-OFL.txt`.
- Font files are self-hosted through Fontsource; the interface makes no font-service requests. [Playfair Display distribution](https://fontsource.org/fonts/playfair-display), [Inter distribution](https://fontsource.org/fonts/inter).

## Original identity and demo artwork

The current reading-spirit identity and book-and-spirit logo were recreated from the user's supplied Yomikura identity references. Palette variants, sanctuary scenes, mascot poses and the fictional demo stories were generated for this project with the built-in image-generation tool. They do not incorporate existing comic pages or franchise characters. Asset provenance is recorded in `public/identity/README.md` and `public/demo/README.md`.

## Radix UI

- **Project:** [Radix Primitives](https://www.radix-ui.com/primitives)
- **Copyright:** WorkOS and contributors.
- **License:** MIT. Packaged license: `public/licenses/radix-ui-MIT.txt`.
- **Role:** Accessible select controls, including keyboard navigation, focus management and portaled menus. The visible design is Yomikura's own themed interface.

---

*For Yomikura's own license, see [LICENSE](LICENSE). For legal disclaimers, see [TERMS.md](TERMS.md) and [docs/LEGAL_AND_BRANDING.md](docs/LEGAL_AND_BRANDING.md).*
