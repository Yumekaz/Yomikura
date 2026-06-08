# Legal and Branding Guidelines

Yomikura is an independent, open-source web and PWA client for Suwayomi-compatible manga and comic libraries. This document outlines the legal position, branding boundaries, and content policy of the project.

## Naming & Identity

The name of the project is **Yomikura**. This identity is selected specifically to avoid direct use of or confusion with existing project names such as Mihon, Tachiyomi, Suwayomi, or Keiyoushi.

The name Yomikura:
- Does not imply any official affiliation with content providers or upstream readers.
- Does not suggest that the application hosts, distributes, or provides copyrighted content.

## Legal Disclaimer

The following disclaimer is displayed prominently within the application (under Settings > About) and in all public-facing documentation:

> Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. This app hosts zero manga or comic content. Users are responsible for configuring their own server, sources, and repositories.

## Content & Source Boundaries

- **Zero Content Hosting:** Yomikura does not host, ship, or mirror any manga, comic, or image files. The client serves purely as a local web browser shell.
- **No Scraping Logic:** The frontend application does not contain web scraping code, site-specific bypasses, or proxy endpoints. All catalog queries and page retrieval are handled exclusively by the user's self-hosted Suwayomi server.
- **Copyright Compliance:** Screenshots, mock modes, and demo registries use public domain, synthetic titles, or abstract placeholders. The codebase does not bundle copyrighted graphics or real-world manga catalog details.

## Extension Registry Boundary

APKs and extensions are Android-specific binaries. Yomikura does not execute APKs or run Kotlin source extensions inside the browser. It only parses and displays metadata from extension repository indexes (such as Keiyoushi's index JSON) to allow users to trigger server-side installations on their connected Suwayomi instance.
