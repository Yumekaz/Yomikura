# Reliability batch 3: reader continuity

Date: 2026-10-23, Asia/Calcutta. Starting checkpoint: `ed34929`.

This batch addresses G05 (webtoon positioning) and G07 (continuous-reader ownership), including the acknowledged-completion case found while testing G04. The existing React/Tauri/Suwayomi architecture and visual design are preserved. Changes and evidence remain local.

## Reader contract

- A reading session owns a fixed starting chapter and an ordered stream. Progress acknowledgement and metadata refetches cannot reinitialize that stream.
- The visible page supplies the active chapter. Its title, page count, thumbnails, adjacent links, page URLs, exit destination and progress all use that owner. The URL follows the active chapter without remounting the session; external chapter navigation and reload start a fresh session.
- Stable chapter/page wrapper anchors survive image virtualization. Cold restoration, thumbnail and keyboard jumps move the actual target below the measured header, instead of changing only the counter. A jump tracks delayed preceding images until layout settles; user input cancels it. Resizing preserves the current page and its fractional viewport position.
- Visible-page selection supports strips taller than the viewport. Images must be ready before automatic progress is saved. Unloaded and failed images cannot create completion through navigation alone.
- Switching between webtoon and paged modes retains the active owner. Paged image fetching, preloading and progress use the appended chapter rather than the initial chapter.
- Initial and appended chapters share the same backend-captured metadata/page resolver. Cache fallback checks chapter ownership. An aborted request cannot turn into a successful cache load. Missing next-chapter data leaves a retry control and retains the existing stream.
- Infinite reading prefetches near the stream tail, with duplicate-load protection. Auto-scroll remains a user action; manual wheel/touch/mouse input stops it. Non-infinite automatic next navigation retains its existing delay with timer cleanup.

## Completion and competing metadata

Completion now remains monotonic after the server has acknowledged it, including a subsequent backward page jump during an outage. Fresh server mark-unread observations advance the reader epoch; old automatic callbacks cannot undo that reset. Metadata requests capture a head revision before starting, so a late response cannot replace a newer acknowledged/reset state.

Automatic replay compares against the most recently known server state. A remote reset that happens to equal an older session baseline is still a competing edit and pauses replay. Explicit reset remains separate from automatic completion.

The backend still provides no conditional version field on chapter updates. The limits concerning concurrent devices and backend power-loss durability described in batch 2 continue to apply.

## Implementation map

| Concern | Source |
|---|---|
| Session and active chapter | `src/features/reader/ReaderPage.tsx` |
| Stable wrappers and measured placeholders | `src/features/reader/WebtoonPage.tsx` |
| Visible selection, restore, jumps and resize | `src/features/reader/useWebtoonNavigation.ts` |
| Shared online/cache resolution | `src/features/reader/readerChapter.ts` |
| Image readiness and header measurement | `ReaderImage.tsx`, `ReaderOverlay.tsx` |
| Acknowledged completion and metadata fencing | `src/api/suwayomi/progressStorage.ts`, `progressSync.ts` |

## Verification

Evidence is retained under ignored `.cache/reader-2026-10-23/`. Failure logs and traces are preserved alongside later passing runs.

| Check | Result | Evidence |
|---|---|---|
| Full unit/component suite | PASS: 138 tests, 23 files | `unit-final.log` |
| Production build and application TypeScript | PASS | `build-attempt3.log` |
| Full production browser suite | PASS: 51 tests | `browser-final.log`, `browser-final/` |
| Additional auto-scroll characterization | PASS: chapter crossing and manual pause | `auto-scroll-attempt1.log`, `auto-scroll-attempt1/` |
| Actual Suwayomi reader checks | PASS: 2 scenarios | `live-attempt2.log`, `live-attempt2/` |
| Browser-spec TypeScript | PASS | `browser-typecheck-verified.log` |
| Bundle budget | PASS: 756,415 JavaScript bytes; largest chunk 230,746 bytes | `bundle.log` |
| Version synchronization | PASS: remains `1.0.25-beta.1` | Task output |

The six initial production browser scenarios verify actual visible geometry under delayed/different image heights, first/middle/last thumbnail jumps and resize; active controls/URL and stream retention after acknowledgement; paged mode on an appended chapter; retryable append failure; cached offline continuation; and completion retained on a backward jump after synchronization becomes unavailable. Controlled API/image fixtures inject failures and delays. The offline fixture populates CacheStorage and IndexedDB explicitly; it does not claim that a web download automatically creates a device cache.

The real-server scenarios use the verified project-local Suwayomi v2.3.2243 JAR and the owned `Yomikura Runtime Test` synthetic library. The harness validates the server's local-source path and manga title before mutations. No API responses are mocked. It verifies a mid-chapter restore and first/last thumbnail jumps against actual page images and persisted server positions, resize, then crossing into chapter 2, owner-specific links/URLs, progress, paged mode and reload. Both scenarios passed in installed Chrome against the web app on loopback.

The first real-server attempt found the previously started fixture stopped (`ECONNREFUSED`); its assertions did not run. The owned fixture was restarted and guarded before the passing attempt. The first cached-continuation attempt failed in test setup because the fixture opened IndexedDB before creating its stores. After fixing fixture initialization, the targeted test and full suite passed. A first standalone browser typecheck had an unquoted PowerShell comma argument; the quoted invocation passed. These failed attempts are retained rather than presented as product passes.

## Remaining scope

No new Tauri/WebView reader run was performed in this batch; the web checks establish shared frontend behavior, not native-specific certification. Batch 1's native backup/export checks remain historical evidence. Reader overrides and download jobs still need the remaining G13 backend identity work. Migration safety, tracker binding/synchronization, source filters and navigation policy are separate outstanding workflows.
