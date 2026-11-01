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

Book notes retain device drafts in a dedicated IndexedDB store, scoped to backend, mode and book identity. Sync uses Suwayomi manga metadata under `yomikura.notes.v1`; an independently changed server note requires explicit review. A late response cannot acknowledge a newer device draft.

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

## Download controls and network policy

Device copies now support a bounded parallel page loader (one page by default, up to six), retaining page order even when responses finish out of order. Queue metadata writes are serialized, and all page workers settle before failed/cancelled attempts are cleaned up. A bookmark changed during a download is retained in its saved metadata.

Optional unmetered-only device saving and reading preloads use reported connection information or an explicit cost choice. Unknown connection speed is not treated as proof of Wi-Fi. Blocked jobs remain queued, resume when allowed and can be cancelled. Browser data-saver requests suppress preloading; constrained vertical reading does not render pages ahead of the viewport. An in-flight request may finish. These device rules do not claim control over a remote library's network connection.

Library controls use supported Suwayomi settings for CBZ format, concurrent sources, new-chapter downloading, per-book limits, backlog exclusions and reuploads. Requested values remain visibly pending until acknowledged; rejected settings retain their previous value. Unsupported settings do not block device storage. Automatic download-ahead follows the current/next-saved prerequisite shown in Mihon, retaining eligible future chapters even when the displayed list is filtered to downloads.

Validation: 373 unit tests, 24 related browser checks, typechecking and production build/budget passed. The live owned Suwayomi instance acknowledged format/concurrency changes and their restoration. Archive contents, native exports and cleanup policies are separate verification gates. Tall-image preprocessing is still pending; it is distinct from the implemented wide-page splitting.

## Safe cleanup and complete offline copies

Finished-download cleanup now has durable jobs, bookmark and collection exclusions (including uncategorized books), a delay and a retained completed-chapter count. Manual mark-read cleanup is separate from automatic reader completion; bookmark-only edits cannot trigger it. Jobs wait for acknowledged reading progress and refresh chapter identity, read state and collection metadata before removal. Explicit resets invalidate old jobs. Switching profiles, changing policy or bookmarking while removal is in flight retains the independent device copy. Disabling a cleanup policy cancels its pending jobs across profiles without deleting files or progress.

The server API does not offer an atomic conditional delete: another client's edit after preflight can race a server removal. Local state is checked again after the request, and network/metadata failures keep the job and device copy for recovery. Local-source original archives are never passed to the server download-removal operation.

Offline chapters are marked complete only after every image decodes, so an HTTP-success error page cannot become a saved chapter. Failed parallel attempts settle before cleanup and retain earlier complete copies. Storage settings show an unknown capacity honestly rather than inventing a quota; saved pages are described as device storage.

Mihon evidence: `domain/download/service/DownloadPreferences.kt` and `ui/reader/ReaderViewModel.kt` (`deleteChapterIfNeeded`, retained chapter slots and bookmark policy). Validation: 392 unit tests and 16 browser checks passed for this batch, covering protection/races, delays, complete pagination, duplicate editions, error-page decoding, retry and profile isolation. Native and live removal remain separate gates.

## Request transport and performance

Generated queries remain transport strings instead of eagerly parsed document nodes. A small Fetch transport now handles this application's generated requests, merged headers, strict GraphQL errors and cancellation from either the client or operation. This removes the unused runtime AST parser and reduces shipped JavaScript by about 50 KB in this batch. Every named operation and embedded fragment is parsed in a regression check, and the SDK was checked against the isolated live server. No build budget was relaxed. 399 unit tests, 23 browser checks, strict browser-spec types and the production build/budget passed. A previous generator string-mode experiment failed its runtime check and was replaced before committing.

## Note portability and migration

Device notes have JSON export/import, including unsynced drafts and backend/mode isolation. Imports validate the entire file, verify each book's ID and title against the selected library, and add drafts in one transaction. Existing device notes are kept. Imported drafts require deliberate synchronization, preserving independently changed server notes for review.

New library backups retain a note snapshot beside the server archive, verified with their device storage write. The archive format stays unchanged. Saved backups can export the snapshot or add missing notes after book identities are checked; existing notes are never silently rolled back. Library backup downloads and note exports are separate files. Older backups remain usable without a note snapshot.

Migration reviews the combined destination note, preserving different source/destination notes and unsynced conflicting versions. Revision checks detect edits after review, and a confirmed note copy is required before original membership is removed. Original notes remain with their book. The backend metadata API lacks an atomic conditional update, so other-client writes during the final request remain a backend concurrency constraint.

Validation: 407 unit tests and 22 related browser checks passed, including backup/restart recovery, note exports/snapshots/import identity checks, note-aware migration and existing chapter actions. Production build/budget passed. Native export-folder and long-image work continue separately.

## Reader exports

Page tools now export the captured chapter as an ordered CBZ, with cancellation during preparation and without advancing reading progress. The chapter owner is captured when its menu opens, including earlier/appended chapters in a continuous session. Images are validated before export. Original raster bytes remain intact; native vector-page exports become PNG.

The desktop app can choose a persistent export folder and organize files by book. The native command accepts binary data with bounded metadata rather than a large JSON array, validates every filename/image/archive before writing, rejects linked destinations and creates numbered files on collision. Completed exports are read back for verification. Folder-selection, profile-change and storage failures cannot report success. Existing files are retained.

Validation: 413 unit tests, 23 Rust tests, all-target Clippy, strict browser-spec types and production build/budget passed. Of 24 related browser cases, 23 passed initially; a transient theme-change contrast failure was fixed by applying text/surface colors together. All 12 reader-experience cases passed the final run, including original-page saving, chapter export/cancellation and light/dark accessibility. Native folder-dialog/runtime export remains an explicit gate.

## Long-image device optimization

New device downloads can retain lossless PNG tiles beside static tall raster pages. Animations, unsupported decoders and unavailable optional tile storage keep the original intact. The reader uses these tiles for vertical reading, with original images available for rotated/cropped views, page sharing and exports. Tiling uses additional device space and does not change server download state or the backend page count.

Layout dimensions remain stable as individual tiles load. Page visibility is separate from completion readiness: reaching the end cannot complete the chapter before its final displayed tile decodes. Missing tile data falls back to the complete original. Cache ownership, failed-attempt cleanup and download deletion cover both originals and tiles.

Mihon evidence: `core/common/.../ImageUtil.kt`, `TallImageSplitCalculator.kt` and `data/download/Downloader.kt`. Mihon can replace downloaded originals with split files; Yomikura deliberately retains originals and keeps logical page numbering stable. Validation: 418 unit tests, 26 reader browser checks, typechecking, strict browser-spec types and production build/budget passed. Browser fixtures isolate service-worker caching; an earlier fallback selector matched a thumbnail and was corrected to target the reading surface. Native runtime and real-server checks remain separate gates.

## Desktop verification and navigation corrections

The isolated Windows build completed managed-library setup using an already verified runtime in a separate test folder. The actual listener bound to `127.0.0.1`. A local test comic was added and saved for device reading; backend download flags remained independent. Native original-page and three-page CBZ exports matched every source image byte-for-byte. A native backup passed gzip/checksum verification and retained an unsynced device-note snapshot. Fullscreen entry and returning to a normal window were observed.

The old Windows folder chooser launched a synchronous PowerShell/Forms dialog. It is replaced with the modern native folder dialog on an owned COM worker, with cancellation and Unicode paths preserved. Selection and export were verified in the native build. This does not change system preferences or install a shell helper.

Native review also reproduced two shared navigation problems. The sticky Resume observer now uses its actual clipped viewport boundary, so gradual scrolling cannot leave it hidden. New non-reader routes start at the top; Back restores the previous entry's position, while reader sessions retain their own page/chapter restoration. Validation: 418 unit tests, 23 Rust tests, all-target Clippy, strict spec types and production build/budget passed. Six comic-action checks passed; the combined navigation/comic/continuity run passed 15 cases and exposed a test scroll targeting the sidebar. Both navigation cases passed after aiming at the content pane. Native wake/restart checks and final whole-suite verification are still pending.

REA/JADX also completed static inspection of Mihon's compiled `ImageUtil.splitTallImage` method. Its body confirms animation handling, region decoding, compression, recycling and file cleanup. The official APK was not executed. Suwayomi v2.3.2243 source at `1d583ca4a718646e17a4c62d23fe8e5edccaf774` is now pinned for the remaining backend-contract comparisons.

## Library policies, release calendar and statistics

Library settings now expose the connected engine’s automatic schedule, backlog/unstarted/completed exclusions, metadata refresh and collection defaults/update/download inclusion. Values change after a matching server acknowledgement. Extra checks while the client is open retain separate, backend-scoped request times and cannot follow a delayed response into another profile. A shared progress notice remains available across ordinary navigation; cancellation requires the backend’s matching acknowledgement.

Collection management supports keyboard-accessible move-up/down controls with confirmed positions. The implicit uncategorized collection is protected. The library loader rejects repeated cursors, repeated books, changing counts and incomplete responses rather than presenting a truncated library or export as complete.

Upcoming provides a calendar and combined include/exclude collection filters. It samples recent upload dates with at most three requests in flight and reuses samples when loading another batch. Stable patterns produce labelled estimates; sparse, irregular, future-dated and overdue patterns do not become promised release dates. Completed publications are excluded. This is a client estimate because Suwayomi does not expose Mihon’s stored prediction. Statistics use the complete library for book/chapter/read/download/linked-tracker and genre totals. Device copies remain separate; unavailable reading duration and comparable provider scores are not invented.

Chapter and update rows now expose partial page positions. Update rows distinguish device and server copies. Offline comic details no longer fabricate a completed publication, author, genre or server download flag.

Evidence: Mihon `UpcomingViewModel.kt`, `GetUpcomingManga.kt`, `FetchInterval.kt`, `ReleaseSchedule.kt`, `StatsViewModel.kt`; pinned Suwayomi `Updater.kt`, `UpdateMutation.kt`, `CategoryMutation.kt` and `MangaType.kt`. REA/JADX completed static inspection of `Manga.getExpectedNextUpdate`: an absent next date or completed publication returns no estimate. This does not establish Android runtime behavior.

Validation: 434 unit tests, 32 browser checks, strict browser-spec types and production build passed. Calendar accessibility passed in light/dark modes; narrow navigation retains its six main destinations. Actual isolated Suwayomi settings/query verification passed, including restoring the original preferences. Hands-on real-library statistics/calendar review completed. The fresh four-title reading run and native follow-up are separate, ongoing gates. No private reference screenshots are included.

## Reading privacy and desktop controls

Incognito pauses new reading progress/history and automatic tracking, while explicit chapter edits remain available. Reader sessions retain their entry privacy state, so a late callback cannot save an incognito session after the mode changes. Per-library automatic tracker policies retain paused work and allow deliberate manual synchronization. Downloaded-only views cover the library, chapter lists and continuation, without treating device copies as server downloads.

An optional privacy curtain hides the interface and removes its controls from focus/accessibility while the window is inactive. Windows builds add an opt-in Windows Hello lock: native verification owns the credential prompt and unlocking requires a confirmed result. No credential is stored in the WebView. This controls app access; library files remain subject to the user’s operating-system account permissions. Other desktop builds expose only supported capabilities.

Native capture protection and close-to-tray preferences are persisted and verified. Tray mode is unavailable without a successfully created tray icon. Normal closing stops the managed engine; tray closing hides the window and keeps the engine available. The isolated Windows runtime confirmed capture exclusion, restored the original capture preference, kept its engine reachable after tray closing, restored the same running window, then stopped its listener after normal closing. Windows Hello authentication with a real user and physical screen-sleep behavior remain unperformed.

Appearance adds pure-black dark surfaces and device/ISO/full chapter date formats. Image maintenance uses Suwayomi’s separate temporary-image and cover stores, confirms the chosen scope, and checks the response before reporting completion. It never calls downloaded-chapter deletion. Backend source `ImageMutation.kt` confirms those separate storage roots. The pinned engine does not expose configurable DoH or custom user-agent settings; its network helper has DoH selection disabled and a managed user-agent flow. The frontend does not pretend those settings can alter source requests.

Build compaction now shares the generated SDK request wrapper; a regression compares every emitted operation’s document, variables, headers, cancellation and middleware metadata with the generated implementation. Unused source-list queries are removed, and the existing system fallback handles historic extended Cyrillic. All supported interface languages retain their previous font coverage. The logo PNG is recompressed with identical palette, alpha and decoded indices; desktop icon files are unchanged. Existing JavaScript and total-size limits are retained.

The real-server reading run passed four Asura titles, two chapters per title, with decoded pages, saved progress and restored reading position. Current targeted browser verification covers incognito/manual actions, paused tracking/profile isolation, downloaded-only exit, focus-event curtain behavior, accessibility, appearance and bounded maintenance. Failed attempts remain in private evidence. Full-suite verification and the final fifty-reference reconciliation remain separate gates.

## Final reference reconciliation and validation — 2026-11-01

All 50 private references were individually reviewed and reconciled in [MIHON_REFERENCE_IMPLEMENTATION.md](MIHON_REFERENCE_IMPLEMENTATION.md). Each has an implementation pointer and an explicit result: implemented, adapted, or bounded by a concrete platform/backend contract. All 50 image fingerprints still match the private originals; no reference image, raw audit note, APK, personal backup or local trace is tracked for publication. This is coverage of the supplied references, not a claim that every Mihon feature or hardware/provider scenario is identical.

The final batch adds optional propagation to existing numbered duplicate editions. It queues peers before acknowledging the original completion so an interrupted inventory lookup remains retryable. Peers retain their page position and gain neither a fake history entry nor another automatic tracker event. Explicit unread/reset priority is retained; invalidated duplicate work cannot swallow a coalesced bookmark edit. Future source discoveries and release-aware engine scheduling remain backend limitations.

Source management now reads complete extension catalogs, presents publisher/mixed-content/obsolete metadata, and renders large matching lists in batches. Individual extension verification uses the exact package identity. Store cards expose safe website/community links and copying. Source preferences support multi-choice sets, preserve hidden-field positions, respect disabled fields, mask sensitive text, recheck identity before writing and require a matching response before reporting success. Tracker accounts handle expiry and confirmed sign-out without deleting linked works.

| Check | Final result |
| --- | --- |
| Unit tests | 447 passed across 67 files |
| Browser inventory | All 220 expected cases verified passing against the frozen final build |
| Browser execution detail | Initial run interrupted after case 157; 156 had passed. Its corrupt-image fixture was corrected to block service workers, then the remaining cases and overlapping safety cases passed in a 66-case completion run. No cases are missing; earlier failures remain preserved. |
| Source and browser-spec typechecking | Passed |
| Production build, version consistency and bundle limits | Passed: 3,126,706 total bytes; 1,046,565 JavaScript bytes; limits unchanged |
| Native Rust and all-target Clippy | 25 tests passed; Clippy passed with warnings denied |
| Updated Windows build | Compiled and launched using the isolated application identity |
| Actual engine reading | Four Asura titles, two chapters each: decoded pages, acknowledged progress and reopened position passed |
| Actual engine contracts | Download/update preferences, complete source/catalog queries and temporary-image cleanup verified; settings restored and library progress/download counts preserved |
| Native persistence and isolation | Saved library recovered on restart. Local profile showed one device chapter; remote profile showed four books and zero device chapters; restoring local recovered its saved copy. Original profile restored. |
| Native capture/lifecycle | Capture exclusion observed; tray close retained the engine, restoring reopened the same window, and normal close stopped the listener. Original preferences restored. |
| Native backups/exports/fullscreen | Verified backup and notes, exact original-page/CBZ bytes, chosen-folder writes and fullscreen restoration passed in earlier batches |

Unperformed runtime checks remain explicit: Windows Hello with a real user, a signed-in tracking provider, physical display sleep/e-ink response, and other operating systems. Real authentication remains a manual gate; no credential or authentication success is invented. The per-reference report records API/platform differences instead of hiding them behind nonfunctional controls.
