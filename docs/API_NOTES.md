# Suwayomi Server API Notes

This document contains notes on the Suwayomi Server GraphQL schema and API surface, discovered during Phase 3 of the Yomikura project. 

Because we strictly avoid hallucinating API queries, these notes are based on direct introspection of the bundled Suwayomi server API. Yomikura 1.0.9 upgrades the desktop server to `v2.3.2243`.

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
