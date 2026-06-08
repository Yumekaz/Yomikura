# Privacy Policy

**Last Updated:** June 2026

Yomikura is a free, open-source, client-side web application. We value your privacy and are committed to protecting it. Because Yomikura runs entirely in your local web browser, we do not operate any central servers, collect any personal data, or track your reading habits.

---

## 1. Information Collection & Processing

- **No Personal Data Collection:** Yomikura does not collect, request, or store personal information such as names, email addresses, phone numbers, or user accounts.
- **No Telemetry or Analytics:** We do not use any telemetry, analytics trackers, or crash-reporting services. No data about your usage patterns, device specs, or IP addresses is transmitted to the project maintainers or any third parties.
- **Local Connection Data:** The application requires you to enter your self-hosted Suwayomi Server URL. This connection configuration is processed entirely client-side in your browser and is never sent to us.

---

## 2. Data Storage (Local-First)

All application data, preferences, and cached content are stored locally on your device:
- **Client Preferences:** Settings (such as light/dark mode, accent colors, and layout densities) are stored in your browser's `localStorage` or `IndexedDB` via Zustand state hydration.
- **Chapter Cache:** Downloaded pages and chapter images are cached in the browser's Cache Storage API (IndexedDB) for offline reading.
- **Data Deletion:** You can delete all data stored by Yomikura at any time by clearing your browser's site data, cookies, and cache for the application domain.

---

## 3. Third-Party Endpoints

When you configure and use Yomikura, your browser communicates directly with the following third-party endpoints:
1. **Your Suwayomi Server:** All requests to fetch manga titles, libraries, chapter page lists, and reading progress go directly from your browser to the Suwayomi server instance you configure.
2. **Extension Repositories:** If you configure custom extension repository catalogs (such as Keiyoushi), Yomikura fetches these metadata indexes (`index.min.json`) directly from the specified repository URLs.

These external services are governed by their own respective privacy policies. We do not control and are not responsible for the data collection policies of your self-hosted server or the third-party extension repositories you choose to add.

---

## 4. Updates & Contact

As Yomikura is a static frontend project hosted as a code repository, updates to this policy will be committed directly to this file. For any inquiries regarding our privacy practices, please open a GitHub Issue in the project repository.
