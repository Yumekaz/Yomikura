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

## Comic details and chapter actions

Implemented source-link opening/copying, an explicit metadata-and-chapter refresh, expandable synopsis, and a compact sticky first-unread Resume action. Chapter menus support right-click and Shift+F10 with arrow-key navigation. Touch swipes provide read/unread and bookmark shortcuts; normal rows keep selection controls out of the way.

Book notes retain device drafts in a dedicated IndexedDB store, scoped to backend, mode and book identity. Sync uses Suwayomi manga metadata under `yomikura.notes.v1`; an independently changed server note requires explicit review. A late response cannot acknowledge a newer device draft. Local drafts are separate from Suwayomi's backup format and currently require their own export for portability.

Bookmark edits now use the durable progress outbox. Confirmation checks the bookmark value returned by Suwayomi, and replay preserves read state, reader reset fences and pending tracker completion. Bookmark-only operations do not manufacture reading history or invalidate an active reader's progress epoch.

Mihon evidence: `ui/manga/MangaScreen.kt`, `ui/manga/notes/MangaNotesScreen.kt`, `presentation/manga/MangaScreen.kt`, and `domain/manga/interactor/UpdateMangaNotes`. REA discovered and inspected the compiled `MangaNotesScreen$Model`; its preserved fields include the note updater and note state. The source-level wrapper class name was absent from the optimized APK, a failed attempt retained privately.

Validation: 355 unit tests, production build, strict browser-spec typechecking and bundle budget passed. The 19 related browser cases were exercised, including five new comic-action checks; all five passed the final focused run. Earlier attempts retained selector/timing failures and one startup-port conflict. Existing restart/profile/reset conflict checks also passed. Full-suite and actual-server/native follow-up remain separate gates.

## Remaining implementation

Reader display/navigation/page tools, download/cleanup policies, update scheduling/statistics, privacy/tracking and desktop-specific equivalents are still being compared and implemented. The full 50-screen work is not yet complete.
