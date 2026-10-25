# Reading flow and first-launch verification · 2026-10-25

History now presents one latest activity per comic. Resume finds the first unread chapter independently of newest-first display. First launch recommends the managed desktop library and keeps the demo secondary. The desktop runtime installer also repairs a real clean-install failure uncovered during this work.

## Product changes

| Before | After | Why |
|---|---|---|
| A recent-history row for every chapter | One most-recent chapter per comic, selected by reading time | A reread of an earlier chapter remains the latest activity; chapter number is not a substitute for recency. |
| Descending chapter display could reverse continuation | Display direction is separate from forward reading order | Fifty completed chapters in a hundred-chapter book lead to chapter 51 in either display direction. |
| Completed latest activity could disappear from Continue or reopen the completed chapter | Library and History continuation resolve the next unread chapter | Partial chapters retain their saved position; completed chapters advance. |
| A fully read cached book offered Resume or appeared to have no chapters | A deliberate **Read again** action | Rereading remains available online and offline. |
| Bright, floating offline pill | Quiet inline notice using the active palette, with a Reconnect action | Connection state stays understandable without competing with the reading interface. |
| Web first launch promoted the demo | Desktop download leads, existing-library connection remains available, demo is secondary | New readers have a direct route to a real library. |
| Desktop first launch asked readers to choose storage among several equal options | **Set up my library**, with folder and portable options disclosed secondarily | The recommended path handles location, reading essentials and the local address automatically. |

The desktop manages its reading engine and prepares a verified runtime when needed. This does not require a reader to install Java manually or select a port. A normal website cannot launch a private Java server on a visitor's computer; the website therefore recommends the desktop installer or connects an existing Suwayomi library.

## State and data behavior

- History merges server and device activity before grouping by comic. Search runs on the grouped result, so searching an old chapter cannot resurrect a duplicate row.
- Removing a comic from recent activity uses a backend- and demo-scoped local marker. Earlier chapters, including subsequently loaded backend pages, stay hidden. Reading progress is preserved, and fresh activity can appear again. Separate local and server cutoffs handle a server clock ahead of the device.
- Chapter history remains stored at chapter granularity underneath the comic-level presentation. No migration discards reading records.
- Backend history pagination remains chapter-based. The UI fills a useful comic list with bounded prefetching and an explicit older-activity action. A local removal refreshes device history without unnecessarily refetching every server page.
- Reading order retains scanlator, availability and status filters, but normalizes display direction for continuation. Manual chapter selection, active-owner checks, offline replay and explicit reset fences remain in place.
- History is accessible offline even when its locally saved activity has no downloaded page images. Notices distinguish saved chapters from recent activity.
- Setup stays mounted through connection retries and the successful native handoff. Leaving during a download cannot launch an abandoned engine, and retry cleanup cannot kill its replacement.
- Managed storage uses the current app's private data directory and is bound to its local profile. Choosing a local library preserves existing remote profiles. Existing-library connection fields stay open during background retries.

## Mihon evidence

All **50 supplied screenshots** were individually opened at original detail before source implementation. The images and the per-image review manifest remain local, under the ignored reference/evidence directories. Neither the screenshots nor their personal reading/device information is included in Git.

The source comparison used Mihon **v0.21.2**, commit `9612d955db3165e1578fdf9ff19ca9b7762c4a46`:

- [History view](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/data/src/main/sqldelight/tachiyomi/view/historyView.sq) groups the latest read event by manga and searches the resulting comic history.
- [Next-unread selection](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/app/src/main/java/eu/kanade/tachiyomi/util/chapter/ChapterGetNextUnread.kt) accounts for descending presentation when finding the first unread chapter.
- [History continuation](https://github.com/mihonapp/mihon/blob/9612d955db3165e1578fdf9ff19ca9b7762c4a46/domain/src/main/java/tachiyomi/domain/history/interactor/GetNextChapters.kt) distinguishes incomplete current chapters from completed chapters.

REA **6.7.0** and JADX **0.7.1** also inspected the official v0.21.2 APK, SHA-256 `dcfe07027cb000fac92f10303e4bc98feca3e6a4aeb026aaafce8fbe9e5c423f`. The preserved `MangaViewModel.getUnreadChaptersSorted` method corroborates normalizing unread order when presentation is descending. The source-level Resume wrapper was not available as a named compiled method; that failed lookup is retained separately. These are static observations. REA did not execute Mihon or perform an Android runtime capture.

The screenshots also informed the distinction between chapter-level Updates and comic-level History, contextual selection, compact reading controls, grouped settings and first-time source guidance. This pass does not claim that every mobile setting or Android-specific capability was ported to desktop.

## Native installer correction

The clean desktop test excluded system Java from the test process's search path. It exposed an existing failure: PowerShell `-Command` did not bind the trailing extraction paths to `$args`, so the downloaded private runtime could not be unpacked.

Extraction now passes correctly quoted literal paths, including spaces, apostrophes and metacharacters. A real Windows extraction test covers those paths. Java compatibility checks require Java 21 or newer, recognize older version formats, and check successful execution rather than the mere presence of a file. A previously downloaded runtime archive is reused only after its pinned checksum is verified.

After the fix, the isolated desktop flow prepared its private Temurin **21.0.12.1** runtime and verified Suwayomi **v2.3.2243**, started the managed backend, and reached the live library without a manually entered address. Process inspection confirmed the backend used the app-private Java executable. The preview subsequently displayed real source content and saved reading activity.

Managed startup now explicitly requests the loopback address. The post-restart socket check for that final argument remains part of the pending packaged restart check described below.

## Verification

| Check | Result |
|---|---|
| Unit suite | **333 passed**, 43 files |
| Clean full browser suite | **150 passed** |
| Focused reading/onboarding/offline browser suite | **34 passed** |
| Rust unit tests, including real Windows archive extraction | **17 passed** |
| Rust formatting and Clippy | Passed |
| Source and strict browser-spec checking | Passed |
| Production frontend build, version synchronization and bundle gates | Passed |
| Real Asura completion and continuation | Passed |
| Actual clean desktop setup without system Java | Passed |
| Packaged desktop restart and final socket check | **Not performed: computer control remained paused after Escape** |

The real Asura check completed two existing unfinished chapters by navigating to their final decoded images. Suwayomi acknowledged completion and the final page index. Details Resume, newest-first display, the library Continue card and History all advanced to the next unread chapter. History contained four comics rather than eight chapter rows. A separate fresh client, without local progress heads, agreed with the backend. No JavaScript page errors were recorded. This was a functional simulation of reaching chapter endings, not a claim that a person read every page.

The frontend output is **3,039,801 bytes**, including **945,141 JavaScript bytes** and **737,260 identity bytes**. The largest JavaScript chunk is **235,343 bytes**; existing limits pass.

Raw logs, traces, screenshots, APK observations and live source data stay under `.cache/reading-experience-2026-10-25/` or the existing ignored REA directory. Failed attempts are retained: the server-clock removal regression, excess history refetching, the original Windows extraction failure and the obsolete Resume expectation for a completed one-page offline fixture. The corrected clean browser run passed all 150 cases.

## Remaining check and publication scope

A private safety backup was saved, read back and verified before the planned packaged restart. No library was reset or restored. Computer control was stopped with Escape; even after the user authorized resuming, the tool still reported the run as stopped. The app was left open. Completing the packaged restart and checking its final loopback binding therefore requires a fresh computer-control run.

The source changes are saved incrementally on `codex/reading-room`. A branch push does not replace the currently published installer. Publishing a new installer, signed updates, other operating systems and signed-in tracking providers are outside this verification. The current engine-version check in Settings remains available; this change does not silently replace the pinned backend with an unchecked upstream build.
