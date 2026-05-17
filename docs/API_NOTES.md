# Suwayomi Server API Notes

This document contains notes on the Suwayomi Server GraphQL schema and API surface, discovered during Phase 3 of the Yomikura project. 

Because we strictly avoid hallucinating API queries, these notes are based on direct introspection of the `v2.2.2100` Suwayomi server release.

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
