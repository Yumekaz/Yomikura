# Security

Yomikura is a frontend for user-controlled reading infrastructure. The safest architecture is to keep source execution and extension handling on the backend.

## Trust Boundaries

| Boundary | Rule |
| --- | --- |
| Browser frontend | UI, preferences, metadata display, reader rendering |
| Suwayomi-compatible backend | extension execution, source logic, library state, downloads, backups |
| Extension repositories | untrusted metadata and APK files |
| Source websites | external services reached by backend extensions |

The browser should not execute extension code, scrape arbitrary source websites, or proxy content for other users.

## Server URL Handling

The server URL setting should:

- accept HTTP for localhost development
- prefer HTTPS for remote servers
- reject dangerous protocols such as `file:`, `data:`, and `javascript:`
- warn or block private network targets in contexts where that is unsafe
- normalize trailing slashes
- derive GraphQL endpoint predictably
- show precise connection errors

Remote server security depends on the user's Suwayomi setup. Yomikura should not imply that exposing Suwayomi publicly is safe by default.

## Extension Repo URL Handling

When extension repo management is implemented, repo validation should:

- allow HTTPS by default
- reject non-JSON responses
- enforce a response size limit
- enforce timeout behavior
- validate expected index shape
- handle malformed items without crashing the app
- avoid automatically trusting repo metadata

Private network or raw IP repo URLs should be treated as advanced behavior.

## Browser APK Execution Is Forbidden

Mihon/Tachiyomi extensions are Android-oriented APKs. Yomikura must not attempt to install or run them in the browser.

Any install/update/uninstall UI must call a backend capability and show an unsupported state if the backend does not expose that capability.

## Data Storage

Client-side storage may hold:

- server URL
- theme
- reader mode
- browse preferences
- NSFW visibility preference
- UI state

Client-side storage should not hold secrets unless a later authenticated setup explicitly designs for it.

## Mock Mode Risk

Mock mode can make a project look more complete than it is. If implemented, it must:

- require an explicit environment flag
- show a visible banner
- use synthetic data
- avoid real source names and copyrighted-looking content
- never be used as proof of backend integration

## Dependency Security

Before public beta:

- run dependency audit
- review PWA/service-worker behavior
- avoid telemetry by default
- document supported backend versions
- document safe local and remote setup assumptions
