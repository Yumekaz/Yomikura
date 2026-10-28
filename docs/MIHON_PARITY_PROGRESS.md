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

## Reader display and navigation

Implemented independent skip-read, skip-filtered and duplicate-edition policies, retaining the directly opened chapter and preferring its scanlator. Unnumbered extras stay distinct. Display preferences include reader background, optional persistent page number, mode/tap guidance, configurable navigation zones/inversion, scroll-based control hiding and a vertical page navigator.

Pages support double-click zoom, Ctrl-wheel zoom, dragging, quarter-turn rotation and wide-page treatment. Paged spreads can be read as two halves; vertical reading can stack the halves. Splitting preserves Suwayomi's physical page numbers. The first half cannot complete the final page. Vertical reading saves position on reaching a final image and completes at its end, while retaining previous completion on rereads.

The former fixed 12% crop was replaced by conservative detection of uniform blank edges on a small image sample. Images that cannot be inspected remain intact. Global defaults and existing per-book overrides are retained. Page tools include original-image download, source-image opening and rotation. Per-title native export folders remain in the storage batch.

Fullscreen restores the previous reading-window ownership on exit. Standard browser wake locks and a Windows native wake worker are implemented; the Windows worker uses independent, expiring reader leases and refuses to keep a hidden/minimized window awake. Other desktop WebViews can use their standard wake capability. A bounded optional refresh flash is provided for e-ink users; physical e-ink ghosting has not been measured.

Cached image dimensions are associated with their URL, and virtualized reading-strip pages reserve their last measured content height while remounting. Regression checks caught and fixed a temporary-height collapse that could shift the current chapter after a scroll. Earlier failed attempts and synthetic geometry journals remain private.

Mihon source evidence: `ui/reader/ReaderViewModel.kt`, `ui/reader/setting/ReaderPreferences.kt`, and `util/chapter/ChapterRemoveDuplicates.kt`. REA/JADX inspection of the compiled reader model confirmed the chapter-list, pending-progress and serialized-write members and preserved chapter-loading methods. This is static APK evidence, not Android runtime execution.

Validation: 363 unit tests, production build/budget, strict browser-spec typechecking, 19 Rust tests and all-target Clippy passed. All 44 related browser cases were verified across final and focused runs; the eight continuity cases also passed three consecutive runs (24 checks). Checks include detected cropping, zoom/pan, both spread modes, last-image completion, fullscreen restoration, page export, page navigation, preferences/reload, light/dark accessibility and wake-lock cleanup. Native fullscreen/wake behavior still requires the fresh-profile runtime gate; unit tests alone do not establish it.

## Remaining implementation

The generated SDK now uses `graphql-request`'s existing lightweight `gql` helper. Queries remain transport strings instead of being eagerly parsed into document nodes. Every named operation and embedded fragment is parsed in a regression check, and the SDK was checked against the isolated live server. This removes startup parsing; the bundle reduction is modest (1,949 JavaScript bytes), and no build budget was relaxed. 364 unit tests and the production build/budget passed. A generator string-mode experiment failed its runtime check and was replaced before committing.

Download/cleanup and data-portability policies, update scheduling/statistics, privacy/tracking and desktop-specific equivalents are still being compared and implemented. Source contracts and platform/hardware limitations remain explicit. The full 50-screen work is not yet complete.
