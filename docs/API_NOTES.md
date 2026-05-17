# API Notes

Yomikura targets Suwayomi-compatible servers first.

This file is intentionally conservative. Do not add exact GraphQL operation names until they are inspected from a running Suwayomi Server version.

## Current API Assumptions

- The user configures a Suwayomi server base URL.
- The GraphQL endpoint is expected at `/api/graphql`.
- REST or other HTTP endpoints may be used only after they are verified and documented.
- The frontend should treat the backend as user-controlled infrastructure.

## Schema Discovery Rule

Before implementing real API features:

1. Run or connect to a known Suwayomi Server version.
2. Inspect the GraphQL schema.
3. Record the exact server version.
4. Record the exact queries and mutations used.
5. Generate or manually wrap types from real response shapes.
6. Add tests or fixtures for the operations used.

Do not infer query names from memory or from unrelated examples.

## Planned API Areas

- connection test
- library query
- manga detail query
- chapter list query
- chapter page query
- source list query
- source search query
- add/remove library action
- extension installed state
- extension install/update/uninstall actions where supported
- download queue and chapter download actions
- backup and restore actions where supported

## Error Model

The UI should distinguish:

- invalid URL
- server unreachable
- GraphQL endpoint missing
- CORS or browser network failure
- server returned GraphQL errors
- unsupported backend capability
- authentication or access failure if enabled by user setup

Error messages should be actionable and should not imply Yomikura provides content or source access by itself.

## Mock Mode

Mock mode is allowed only behind an explicit environment flag such as `VITE_MOCK_MODE=true`.

Mock mode must show a visible banner. It must not be used to claim the MVP is complete.
