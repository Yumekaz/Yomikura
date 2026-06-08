# Security & Trust Boundaries

Yomikura is designed to run entirely inside the client browser as a static frontend shell. This document outlines the security architecture, data storage policies, and trust boundaries of the application.

## Trust Boundaries

The application operates across distinct boundaries:

1. **Browser Frontend (Yomikura):** Responsible for the layout rendering, reader display, and client preferences (stored locally via Zustand/localStorage).
2. **Suwayomi Backend:** Responsible for extension execution, catalog scraping, library state, downloads, and progress tracking.
3. **Extension Repositories:** Third-party indexes that provide metadata catalogs. Yomikura parses these catalogs as static JSON metadata.

The browser client does not execute compiled extension binaries or make direct scraping connections to content providers, preserving browser security policies (CORS).

## Connection Security

- **Server Connection URLs:** The app accepts standard local URLs (`http://localhost` or LAN IPs) for self-hosted installations and supports HTTPS for remote servers. Unsafe protocols (such as `data:`, `javascript:`, or `file:`) are blocked.
- **CORS Configuration:** Yomikura provides user-friendly CORS error messages and connection testing tools to help users securely configure their client-to-backend communication.
- **NSFW Filters:** The app includes a global setting to filter out flagged adult content metadata based on parameters provided in extension repository index JSONs.

## Data Storage Policies

All client-side preferences are stored locally in the browser's storage (IndexedDB and localStorage).
- **Stored Data:** Connection profiles, theme selections, reader configuration settings, and downloaded page caching.
- **Security:** Yomikura does not collect, track, or transmit telemetry or usage analytics. All saved server profiles and preferences remain entirely private to the user's browser.
