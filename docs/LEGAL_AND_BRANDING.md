# Legal and Branding

Yomikura must be positioned as an independent web/PWA client for Suwayomi-compatible manga and comic libraries.

## Naming

`Yomikura` is the project name. It avoids direct use of Mihon, Tachiyomi, Suwayomi, or Keiyoushi names in the product identity.

Before public release, the final name should be checked for:

- confusion with existing reader projects
- trademark risk
- implication of official affiliation
- implication that the app provides content

## Required Disclaimer

Use this disclaimer in public docs:

```text
Yomikura is not affiliated with Mihon, Tachiyomi, Suwayomi, Keiyoushi, or any content provider. This app hosts zero manga or comic content.
```

## Public Copy Rules

Allowed:

- "A web/PWA client for Suwayomi-compatible manga and comic libraries."
- "Connect to your own Suwayomi Server."
- "Display extension repository metadata."
- "Reader interface for self-hosted libraries."

Avoid:

- "Mihon Web"
- "Tachiyomi in browser"
- "free manga site"
- "read any manga for free"
- "built-in sources"
- "we provide extensions"
- "browser extension execution"

## Content Boundary

The app must not ship manga, comic content, source scraping code, or hosted source proxy behavior.

Screenshots and demo data must use synthetic titles, abstract covers, local placeholder data, or user-provided backend data. Do not use copyrighted-looking manga panels or real catalog titles as built-in demo content.

## Extension Repository Boundary

Extension repositories such as Keiyoushi provide catalog metadata and APK files for compatible Android/server runtimes. Yomikura may display metadata and guide backend-supported actions, but it must not represent browser-side APK execution as possible.

Keiyoushi should be a user-selected preset/helper later, not silently enabled by default.

## Affiliation Boundary

References to Mihon, Tachiyomi, Suwayomi, and Keiyoushi should be factual ecosystem references. They should not be used as project branding, logos, endorsements, or official partnership signals.
