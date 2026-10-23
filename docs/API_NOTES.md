# Suwayomi Server API Notes

This document contains notes on the Suwayomi Server GraphQL schema and API surface, discovered during Phase 3 of the Yomikura project. 

Because we strictly avoid hallucinating API queries, these notes are based on direct introspection of the bundled Suwayomi server API. Yomikura 1.0.10 upgrades the desktop server to `v2.3.2243` and hardens desktop storage lifecycle handling.

## Discovered Schema Information

- **Endpoint:** `POST /api/graphql`
- **Tooling:** We use `graphql-codegen` along with `graphql-request` to generate our TypeScript SDK.
- **Generated Types:** Our types and SDK are automatically generated to `src/api/graphql/generated/graphql.ts`.

## Core Queries Implemented

### `ConnectionTest`
*Location: `src/api/graphql/queries/connectionTest.graphql`*

A lightweight introspection query used by the frontend to confirm network reachability and GraphQL endpoint validity.
```graphql
query ConnectionTest {
  __typename
}
```

## Upcoming Discoveries
As we move into **Phase 4 (Library Flow)** and beyond, this document will be expanded with actual queries for:
- Library Manga retrieval (`getLibrary`)
- Extension Repositories
- Source Browsing
- Reader Chapter Page fetching

*Note: The frontend does NOT perform any content scraping or execution of Android extensions. All data fetching logic passes cleanly through the Suwayomi backend GraphQL API.*

## Library Queries
### \mangas\ query
- Used to fetch the user's library by filtering \inLibrary: { equalTo: true }\.
- Supports fetching by \categoryId\ via the same \ilter\ block.
- Thumbnail URLs can be absolute or relative. If relative, they must be prefixed with the Suwayomi server base URL.

### \categories\ query
- Fetches all user-created library categories.
- Useful for building filter tabs on the library page.

## Manga Details Queries
### \manga(id: Int!)\ query
- Used to fetch detailed metadata for a single manga, including its source, status, and description.
- Fetches all associated chapters in a \ChapterNodeList\.
- \uploadDate\ is returned as a \LongString\ scalar which we explicitly cast to string on the frontend.

## Reader Queries & Mutations
### \fetchChapterPages(input: FetchChapterPagesInput!)\ mutation
- Fetches the array of image URLs for a chapter. Executed on mount as a mutation since it may trigger a source scraping event.
- Reader image rendering should prefer Suwayomi's backend page endpoint and keep returned page URLs as fallback, because some source image hosts block direct browser hotlinking.

### \chapter(id: Int!)\ query
- Used in the reader to fetch the chapter name, current progress (\lastPageRead\), and the sibling chapters (nested under \manga\) to calculate the Next and Previous chapter routing.

### \updateChapter(input: UpdateChapterInput!)\ mutation
- Patches the \isRead\ and \lastPageRead\ properties in the Suwayomi backend to persist user reading progress across sessions.

## Browse Queries & Mutations
### \sources\ query
- Fetches all installed extensions/sources available on the backend. Returns \SourceType\ including \id\ (LongString), \
ame\, \iconUrl\, and \lang\.

### \etchSourceManga(input: FetchSourceMangaInput!)\ mutation
- Fetches manga directly from a source catalog. Requires \source\ ID, \page\ number, and a \	ype\ enum (POPULAR, LATEST, SEARCH). If SEARCH is used, a \query\ string is required. Returns \FetchSourceMangaPayload\ which includes \mangas\ and \hasNextPage\.

### \updateManga(input: UpdateMangaInput!)\ mutation (Toggle Library)
- Used to toggle the \inLibrary\ status of a manga. Used when viewing a newly discovered manga in MangaDetailPage.

## Client progress recovery

Verified on 2026-10-23 with Suwayomi v2.3.2243. The client persists reading intents before attempting `updateChapter`, captures their endpoint, and replays them through a serialized backend worker. Reset/unread are explicit barriers; earlier acknowledgements cannot remove a newer client intent.

`UpdateChapterInput` supports the chapter ID, optional client mutation ID and a patch containing read/bookmark/position fields. It has no expected-version comparison. The client checks current chapter ownership and progress before automatic replay, but that check and the mutation are not an atomic server transaction. Competing server changes require review; perfect simultaneous multi-device conflict resolution is not claimed.

Pending state is independent of a Suwayomi library backup. See [offline progress recovery](RELIABILITY_BATCH_2_2026-10-23.md) for the persistence, conflict and verification contract, including the backend durability limit observed during forced-stop testing.

## Client reader settings

Title-specific preferences are scoped by canonical backend endpoint, live/demo mode and manga ID. Reader controls use the effective title setting and write to that scope; inherited controls edit global defaults. Earlier numeric-only entries are preserved for an explicit owning-server association in Settings → Reader. These client preferences remain separate from Suwayomi library backups. See [reader settings verification](RELIABILITY_BATCH_4_2026-10-23.md).

## Migration contracts

Migration refreshes the destination using `fetchMangaAndChapters(input: { id, fetchManga: true, fetchChapters: true })`. Stored chapter queries alone do not fetch newly discovered source chapters. Complete chapter loading uses `chapters(condition: { mangaId }, first: 200, after: ..., order: [{ by: ID, byType: ASC }])` and checks totals, ownership and cursor progression.

Chapter state, category union and destination membership must be confirmed before a separately selected replacement removes the original from the library. These operations have no shared backend transaction or expected-version guard. Pending client intent is not proof of server confirmation. See [migration verification and limits](RELIABILITY_BATCH_5_2026-10-24.md).

## Tracker binding and verification

`searchTracker(input: { trackerId, query })` provides the remote work selected for `bindTrack(input: { mangaId, trackerId, remoteId, private })`. Preserve `LongString` remote IDs without numeric conversion. `trackProgress({ mangaId })` synchronizes existing bindings; it is not a search or bind operation.

The pinned tracker implementation can catch individual provider errors and return older records. The client verifies each binding through `fetchTrack({ recordId })` before reporting synchronization confirmation. Manual edits refresh the provider first and send only changed fields; local unlink uses `deleteRemoteTrack: false`.

Eligible reading acknowledgements atomically retain a separate tracker retry marker in the progress head. Reading progress can be saved while tracker verification remains pending. See [tracker verification and account limitations](RELIABILITY_BATCH_6_2026-10-24.md).

## Catalog filter contracts

`source(id: ...) { filters }` exposes filter definitions. Default fields need per-type aliases because their union return types differ. `fetchSourceManga(input: { type: SEARCH, query, filters })` applies positional changes; `POPULAR` and `LATEST` do not use those filter changes. Empty-title filtered searches still require `SEARCH`.

The pinned dispatcher supports root checkbox/text/select/tri-state/sort and one group level containing checkbox/text/select/tri-state. Deeper groups and grouped sorts are not applied. Positional snapshots must be checked against current definitions. Preserve explicit false, zero and empty text; omit a null sort change.

Suwayomi v2.3.2243's built-in Local-source search advertises Date sorting but ignores the selected field index. The client disables that known option only for that source/version. See [catalog filter verification and binary evidence](RELIABILITY_BATCH_7_2026-10-24.md).

## Backup export and restore

Verified on 2026-10-23 against the pinned Suwayomi v2.3.2243 server using a disposable local-source library.

- `createBackup(input: {}) { url }` returns a download URL. A returned URL does not confirm that Yomikura retained the file. Download, validate and save its bytes before recording success or beginning a protected restore.
- Exported files are gzip-compressed `.tachibk` archives. This batch retains library metadata, history and categories; downloaded pages and Yomikura settings are outside this artifact.
- The server's multipart parser supports top-level upload variables. Use `mutation RestoreBackup($backup: Upload!) { restoreBackup(input: { backup: $backup }) { id status { state mangaProgress totalManga } } }`, an `operations` part with `variables: { backup: null }`, and a `map` part containing `{ "0": ["variables.backup"] }`.
- Mapping `variables.input.backup` leaves the nested field null on this version. The failed real-server response and the corrected successful restore are retained in the reliability validation artifacts.
- Poll `restoreStatus(id: ...)` after receiving the job ID. A submitted job or a polling timeout is not confirmed completion. Only `SUCCESS` confirms completion; `FAILURE` is a server-reported failure.

Source: [v2.3.2243 multipart request parser](https://github.com/Suwayomi/Suwayomi-Server/blob/v2.3.2243/server/src/main/kotlin/suwayomi/tachidesk/graphql/server/JavalinGraphQLRequestParser.kt#L44-L107). See [reliability verification](RELIABILITY_BATCH_1_2026-10-23.md) for local validation and limits.

## Extensions Queries & Mutations
### `settings { extensionRepos }` query
- Fetches the configured extension-store/repository URLs exposed by the server's compatibility API.

### \setSettings(input: SetSettingsInput!)\ mutation
- Used to overwrite \extensionRepos\ when adding or deleting a repository URL.

### `fetchExtensions(input: FetchExtensionsInput!)` mutation
- Triggers the backend to refresh all configured extension stores. Current stores use the full `index.json` format; the older minified index may contain only compatibility notices.

### \extensions\ query
- Fetches the compiled catalog of all available extensions. Returns \ExtensionType\ including \pkgName\, \
ame\, \lang\, \isNsfw\, \isInstalled\, \iconUrl\, and \ersionName\.

### \updateExtension(input: UpdateExtensionInput!)\ mutation
- Used to install or uninstall an extension by its \pkgName\ (passed as \id\).
