# Remaining reliability work: implementation and verification

Date: 2026-10-24, Asia/Calcutta. Starting checkpoint: `0c5566b`. This implements the seven areas selected from the continuation handoff: G14, G22, G15, G20, G16, G19 and G21, including real native download/profile verification. It preserves the existing UI, branding and React/TypeScript/Tauri/Suwayomi boundaries. This is not a declaration of complete Mihon feature parity.

## Result by finding

| Finding | Implemented contract | Main source |
|---|---|---|
| G14 download discovery | Downloaded means either available copy; On this device and On server remain separate. Counts deduplicate titles and use the current backend/mode's completed cache records. Offline server availability is unavailable rather than a fabricated zero. | `features/library/downloadAvailability.ts`, `LibraryFilters.tsx`, `LibraryPage.tsx` |
| G22 continuation policy | A backend/mode/manga-scoped policy controls number/source/date order, direction, status and scanlator. Chapter lists, Resume, history's next action and reader next/previous use it. Text search remains a transient list narrowing. | `features/manga/chapterPolicy.ts`, `ChapterList.tsx`, `MangaDetailPage.tsx`, `features/reader/readingSequence.ts`, `ReaderPage.tsx`, `features/history/HistoryPage.tsx` |
| G15 archive import | Web/remote profiles provide server-side copy instructions. Direct native import requires the running engine, matching endpoint/port, managed marker and verified default Local directory. Supported names/headers, size bounds, duplicate names and existing destinations are checked before copying. | `components/library/LocalImportSection.tsx`, `importValidation.ts`, `src-tauri/src/local_import.rs` |
| G20 targeted accessibility | Category dialogs share initial/return focus, topmost-modal handling, Tab wrapping and Escape. Reader controls have names/states; shortcuts respect controls, editable content and browser modifiers. A labelled reading surface is reachable with Tab and has a visible focus indicator. | `hooks/useModalFocus.ts`, three category editors, `features/reader/readerKeyboard.ts`, `ReaderOverlay.tsx`, `ReaderPage.tsx`, `styles.css` |
| G16 crop truthfulness | The existing transform is labelled Fixed page crop and explains its uniform magnification/clipping. Its saved setting and rendering are preserved. Content-aware border detection is not claimed. | `features/reader/ReaderOverlay.tsx` |
| G19 complete updates | Discovery and publication views use their corresponding backend fields, stable ordering and cursor pagination. Known discoveries before library addition are excluded from discovery view; unknown legacy dates remain explicit. Loaded pages survive a next-page error and can be retried. | `features/updates/updateFeed.ts`, `UpdatesPage.tsx`, `api/graphql/queries/updatesAndHistory.graphql` |
| G21 fully disconnected web navigation | Each production build precaches its index, all lazy JavaScript/CSS/font assets and required static files. Unvisited navigation URLs receive the matching cached index. New workers wait for complete installation and existing tabs to close. Activation preserves saved page bytes and unrelated caches. | `vite.config.ts`, `public/sw.js`, `main.tsx`, `PwaUpdateNotice.tsx` |

## Continuation and collection correctness

The reader freezes its eligible sequence at session entry. Completing a chapter selected by an unread filter cannot remove its navigation anchor or collapse appended chapters. Opening a chapter manually retains that anchor even if it does not match the current filter. Unknown numbers/dates sort last; equal numbers use source order and ID deterministically. Special/duplicate chapters and descending order are exercised. No read/group skip is enabled without a selected filter.

Complete chapter loading uses 200-row pages, verifies manga ownership, totals, unique IDs and cursor progress, and applies matching pending local read state. Offline continuation uses owned saved chapters only. Older cache rows cannot supply optional group/bookmark/date metadata they never recorded; a restrictive policy does not invent it. New downloads retain those fields.

### A real backend contract missed by boundary-only fixtures

The released server's chapter connection returns the complete page in `nodes`; its `edges` are constructed from only the first and last result. An actual four-record response had four nodes and two edges. This affected the original update/history list reads and bulk/detail fallbacks. [Released chapter connection implementation](https://github.com/Suwayomi/Suwayomi-Server/blob/v2.3.2243/server/src/main/kotlin/suwayomi/tachidesk/graphql/queries/ChapterQuery.kt#L250-L280).

Collection reads now select nodes for updates, history, manga chapter lists and category snapshots. Bulk library operations retain middle chapters; migration retains middle categories. History continuation also uses the shared complete sequence instead of reduced sibling data. The reader's current-chapter query no longer requests an unused reduced sibling collection. Regression fixtures deliberately provide full nodes with boundary-only edges, so they can detect the original failure.

Discovery uses server `fetchedAt`; publication uses `uploadDate`. `inLibraryAt` supplies the known addition boundary. Backend discovery/addition fields use seconds while Local publication timestamps can use milliseconds; the existing timestamp parser handles both. Equal timestamps retain deterministic ID ordering. Unknown metadata is retained without assigning a made-up date.

## Native import and persistence details

Import accepts CBZ/ZIP, CBR/RAR and EPUB names with matching archive headers, with bounds of 128 MiB per file and 256 MiB per batch. It rejects PDF, path separators, reserved Windows names, trailing dots/spaces, duplicate names including case, symlink/reparse destinations and existing archive destinations. Header checks are not a complete archive-content validation or a replacement for the backend's reader.

The server may report an empty Local path for its default directory. The native command accepts that case only after checking the actual running managed engine and its generated default configuration, then resolving its owned `local` directory. An arbitrary empty/remote path is not turned into a client filesystem destination. Custom/unverified server destinations use manual instructions.

The native command validates the batch, uses create-new file handles, synchronizes and reads back each copy, and never overwrites originals. A later I/O failure reports the verified subset and retains completed/partial copies for inspection. Copying runs off the UI thread. Profile changes cannot retarget the captured endpoint, directory or result.

Native runtime checks found two additional platform-specific problems:

- Image responses serialized `content_type` while the frontend expected `contentType`. The native JSON response now matches the frontend contract; a Rust regression and actual native image fetches verify it.
- Native settings-file writes lacked their command permission. Fallback WebView settings could be newer than the file preferred at startup. The synchronous local copy is now authoritative; native-file mirrors are ordered and use scoped settings-file write/remove permissions. A retained clear tombstone prevents failed file removal from restoring old preferences. Existing file settings remain a recovery source when the local copy is absent.

The native restart check began with a stale file and newer selected profile. After the fix, the selected profile survived restart, the recovery file matched it, and both profiles' image bytes remained available with the engine stopped. These preferences remain independent of a Suwayomi library backup.

The offline library reconnect action also retains the selected endpoint. It no longer rewrites a different profile to the default loopback server.

## Verification

All raw evidence, failed attempts, synthetic archives, browser profiles and test databases remain under ignored `.cache/remaining-2026-10-24/` or the earlier referenced fixture directories. They are local evidence, not publication inputs.

| Check | Result / scope | Evidence |
|---|---|---|
| Unit suite | PASS: 295 tests, 38 files | `unit-completion-final.log` |
| Full production browser suite | PASS: 103 cases after the collection correction | `browser-complete-nodes-final.log` |
| Application TypeScript / production build | PASS | `typecheck-complete-nodes.log`, `build-nodes-final.log` |
| Browser-spec strict TypeScript | PASS: all browser specs | `browser-types-completion.log` |
| Rust unit suite | PASS: 11 tests | `native-unit-completion.log` |
| Required Rust lint | PASS, all targets/features, warnings denied | `clippy-final.log` |
| Guarded real-server application workflows | PASS: 11 | `live-web-completion.log` |
| Real-server reader geometry/ownership | PASS: 2 | `live-reader-completion.log` |
| Real discovery/publication and >100 events | PASS: 101 post-addition discoveries; all 102 fixture chapters in publication view | `live-discovery-verified.log` |
| Real native import/image contracts | PASS | `native-contract-attempt4.json` |
| Real native in-flight profile cancellation, bytes and deletion | PASS | `native-downloads-attempt1.json` |
| Actual native process restart, settings mirror and retained bytes | PASS | `native-restart-proof.json` |
| Native saved-reader/form flows and normal engine start | PASS, including keyboard access to reading surface | `native-ui-flow-final.json` |
| Final native bundle, node queries, cached restore and import smoke | PASS | `native-build-completion.log`, `native-completion.json` |
| Native denied-write handling | PASS: access denied surfaced, no archive created | `native-permission.json`, `native-permission.log` |
| Temporary permission restoration | PASS | `native-permission-restored.json` |
| Normal native engine stop | PASS outside CI bootstrap mode | `native-stop-final.json` |
| Bundle/version gates | PASS: 828,237 JavaScript bytes; largest chunk 231,135 bytes; unchanged `1.0.25-beta.1` | `bundle-final.log`, `version-final.log` |

### What the environments establish

Controlled Chrome scenarios use real IndexedDB/CacheStorage and inject failure/delay responses. They cover all four download-availability combinations, correct counts, overlapping profiles, saved policy/reload, duplicate/special numbers, completion under an unread policy, history continuation, middle-entry bulk/history reads, modal nesting/focus, editable shortcut guards, fixed-crop wording, more than 100 updates, retained pages after error, complete offline navigation and safe worker upgrades.

The real-server harness validates the expected Local source and synthetic title before mutations. The discovery fixture uses marked synthetic archive folders, fetches one chapter before library addition, then backfills 101 old-publication chapters afterward. It checks the actual fetched/addition/publication timestamps and both visible modes, including pagination. No private source libraries or extensions are used.

Native checks run an isolated Windows Tauri/WebView2 test variant with a separate application identifier/profile and the owned Suwayomi data. They execute actual Rust IPC, actual frontend stores and native CacheStorage. A transport proxy forwards real server data while holding an image response; it verifies that cancelling B's overlapping ID leaves A running. Distinct 600/640-pixel PNGs establish actual byte ownership. Deleting B preserves A, and a device-only B save leaves backend download flags unchanged.

After an actual native process exit/restart with its engine offline, both copies and the selected profile were retained. The saved Downloads → Read flow decoded B's cached page; keyboard navigation reached the reading surface and changed the page. The native file-input/form path copied an archive and verified its bytes. A temporary create-file denial was confined to one marked fixture directory, reported by the form, and restored in `finally`; no archive was created. UI Automation also exposed the expected labels/roles. Browser automation through the test WebView was used where the desktop helper's coordinate/focus handling was unreliable.

### Preserved failures

The first code generation ran while the test server was stopped; it was restarted with the verified JAR. Early standalone typechecks exposed generated-field/cursor scalar adjustments. The first new browser attempt included wrong paged-image selectors and a test closure variable; these were corrected. A worker-transition fixture initially opened a replacement client before closing the last controlled client; closing the old client first verified the intended lifecycle. A separate negative run reproduced in-app offline query pausing before the always-attempt/fallback fix.

The native CLI initially assumed default Local paths were reported explicitly. Runtime testing corrected that assumption and the production native default-path proof. A rebuild attempted while the prior test app still held its executable failed; after a confirmed keyboard exit of the isolated app/engine, the build succeeded. A storage-quota unit probe initially spied on the wrong happy-dom prototype and was corrected to inject the actual dependency failure.

The first real update check exposed the boundary-only edge contract; that product issue was fixed. The expanded fixture subsequently confused chapter 1 with chapters 100–102 under a substring locator; exact chapter text preserves the stronger pagination check. Rust lint also required the reverse-find form of a last-matching configuration lookup. Original failures remain alongside later passes.

One permission-test attempt was not executed because automatic approval review reached an account usage limit. After the user resumed and review became available, the action ran through the normal review path and passed. It was not bypassed.

## Limits

- No signed-in provider account was available on the owned test servers. External tracker-account synchronization remains NOT PERFORMED; controlled provider/browser checks are not presented as live-provider confirmation.
- Spoken screen-reader output, physical hardware input, macOS/Linux native runtime and a newly installed public release package were not certified. Targeted keyboard/automated axe checks and Windows accessibility-tree/native WebView checks do not establish full accessibility conformance.
- Native runtime evidence uses the isolated debug test variant. Release signing, installer distribution and unrelated existing user profiles were not changed.
- Browser eviction, backend power-loss durability, simultaneous server compare-and-set conflicts, server-address migration and database replacement at the same endpoint retain their earlier documented limits.
- Content-aware border detection, a complete client-state export format and the secondary feature-completeness backlog are outside this bounded implementation.

Local safety checkpoints for this continuation include `9789eb8`, `b51c981`, `f8f7926`, `585b754`, `cc1760c` and `b7c3d9b`; the final verification/report commit follows in local history. Nothing was pushed, published or submitted as a PR.
