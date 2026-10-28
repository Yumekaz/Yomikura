# Mihon behavior parity implementation

This continues the reading-room redesign and reliability work. The private reference set contains 50 screens, all individually reviewed. The images, personal reading data and raw APK/tool outputs are excluded from publication. A screen being reviewed does not mean every behavior on it is implemented.

## Source baseline

Mihon v0.21.2, commit `9612d955db3165e1578fdf9ff19ca9b7762c4a46`, is the comparison baseline. Source inspection establishes behavior; screenshots establish visible interactions. REA/JADX static inspection of the official v0.21.2 APK supplements the source, without claiming Android runtime execution.

## Library and discovery batch

Implemented:

- Combined include / exclude / neutral library filters for downloaded, unread, started, bookmarked and completed publication status. Started means at least one completed chapter; publication completion is independent of reading completion. Local-source books count as available for the downloaded inclusion filter. Device/server download indicators retain their distinct meaning.
- Backend-scoped filter preferences, pins and recently used sources; optional independent sorting for each collection. Sort choices now include last read, latest chapter date, date added and chapter count.
- Complete cursor-based source loading, including child languages from multi-language extensions. Missing, repeated or changing snapshots fail explicitly rather than silently omitting sources.
- Direct Latest navigation, pinned sources, last-used source and browsing preferences. Hiding books already in the library applies to both source browsing and global search. A fully hidden result page retains pagination.
- Optional filtering of installed source listings using the backend's mature-content flag. This affects Yomikura's listings, not extension execution or server-side access control. Suwayomi exposes a boolean flag, not Mihon's full content-warning classification.
- Bookmark membership loads across chapter pages and refreshes after chapter mutations. Publication-status filtering requests a connection when offline metadata cannot establish it.

Evidence locations in Mihon: `app/src/main/java/eu/kanade/tachiyomi/ui/library/LibraryViewModel.kt` (filter predicates), `domain/src/main/java/tachiyomi/domain/library/model/LibraryManga.kt` (`hasStarted`), and browse/source presentation and view models. REA class inspection of `LibraryViewModel` completed; exact optimized APK names may differ from source names.

Validation for this batch: 347 unit tests, 30 targeted browser tests, application typechecking, production build and bundle budget passed. Browser checks cover combined/excluded filters, publication semantics, bookmark failure recovery, saved per-collection sorting, source pages and large identifiers, source pin/recent/Latest, hidden-only pages, keyboard dismissal and narrow-screen accessibility. Actual-server and native coverage will be recorded separately as the following batches complete.

## Remaining implementation

Comic metadata/actions, reader display/navigation/page tools, download/cleanup policies, update scheduling/statistics, privacy/tracking and desktop-specific equivalents are still being compared and implemented. The full 50-screen work is not yet complete.
