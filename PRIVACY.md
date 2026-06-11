# Privacy Policy

**Last Updated:** June 2026

Yomikura is a free, open-source manga/comic **client** (web, PWA, and optional desktop app). We value your privacy and are committed to protecting it. Yomikura does **not** operate central servers, collect personal data, or track your reading habits.

---

## 1. Information Collection & Processing

- **No Personal Data Collection:** Yomikura does not collect, request, or store personal information such as names, email addresses, phone numbers, or user accounts.
- **No Telemetry or Analytics:** We do not use telemetry, analytics trackers, or crash-reporting services owned by the Yomikura project. No usage data is transmitted to project maintainers.
- **Local Connection Data:** Server URL and data-directory preferences are stored **only on your device** (browser storage or desktop app settings). They are never sent to Yomikura maintainers.

---

## 2. Data Storage (Local-First)

All application data, preferences, and cached content stay on your device:

| Platform | Where data lives |
|----------|------------------|
| **Web / PWA** | Browser `localStorage`, IndexedDB, Cache Storage |
| **Desktop (Tauri)** | User-chosen folder (e.g. AppData or portable path) for Suwayomi databases, extensions, downloads, logs, and optional auto-downloaded JRE |

- **Client preferences:** Theme, reader settings, server profiles.
- **Chapter cache:** Offline pages stored locally for reading without network.
- **Suwayomi backend data:** When desktop mode runs a local Suwayomi instance, library and extension data are stored in your selected data directory—not on Yomikura servers (we have none).

**Deletion:** Clear browser site data (web mode) or use Settings → reset / wipe options (desktop mode).

---

## 3. Third-Party Downloads (Desktop Only)

Desktop onboarding may download, with your consent by choosing storage location:

1. **Suwayomi Server JAR** — from the official Suwayomi GitHub releases.
2. **Java runtime (Temurin JRE)** — from Eclipse Adoptium, if Java is not already present.

These downloads go **directly from those providers to your machine**. Yomikura maintainers do not proxy or log them.

---

## 4. Third-Party Endpoints You Configure

When you use Yomikura, your client communicates with endpoints **you** choose:

1. **Suwayomi Server** — local (`127.0.0.1`) or remote URL you enter.
2. **Extension repositories** — optional catalog URLs (e.g. community index JSON) for your Suwayomi instance.

Those services have their own privacy policies. Yomikura does not control them.

---

## 5. Updates & Contact

Policy updates are committed to this repository. Questions: open a GitHub Issue in the project repository.