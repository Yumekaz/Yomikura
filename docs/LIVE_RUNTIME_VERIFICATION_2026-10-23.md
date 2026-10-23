# Live web and desktop startup verification

Date: 2026-10-23, Asia/Calcutta.

Historical checkpoint before the reliability fixes. G04, G11 and backup follow-up results are superseded by [reliability batch 1 verification](RELIABILITY_BATCH_1_2026-10-23.md). Original failures and evidence below are retained.

The running web application was tested in Chrome against a real Suwayomi backend. Six core workflows passed. Two previously source-verified findings, G04 and G11, were reproduced as actual browser/backend failures. The application starts and supports normal reading, but this is not an all-green correctness verdict.

## Running environment

- Web frontend: `http://127.0.0.1:5173`, Vite development mode, HTTP 200 confirmed.
- Backend: `http://127.0.0.1:4567`, Suwayomi v2.3.2243, bound to loopback only.
- Backend library/database/local-source root: ignored `.cache/runtime-check-2026-10-23/backend-data/`.
- Desktop: native Windows development build completed in 4m 43s; `app.exe` launched and its library/source screens displayed a healthy connection to port 4567.
- The backend was started separately for this check. This does not certify the complete Tauri managed-engine onboarding, bundled runtime download, installer, updater or shutdown lifecycle.

The official server JAR was downloaded and verified against Yomikura's pinned SHA-256, `821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5`. Its size was 174,128,768 bytes. The test library contains only an original synthetic comic, with two CBZ chapters and three PNG pages per chapter. No extension installation or third-party comic retrieval was required.

The first sandboxed frontend process could not expose a usable loopback connection. That process was stopped and the development server was restarted through the reviewed host execution path. Both frontend and backend were reachable afterward.

## Browser method

The requested in-app `@Browser` connector exposed no connected browsers, and its open request was queued. Windows visual browser control also stopped because it could not establish the current browser URL confidently. Those attempts are not counted as a completed web walkthrough.

The completed verification used the repository's working Playwright/Chrome automation. It loaded the real frontend and made real backend requests. There were no `page.route` replacements or mocked GraphQL responses. Browser contexts were isolated from personal Chrome profiles, and demo mode was asserted to be false. Service workers were blocked to keep this check focused on ordinary connected web behavior.

Before changing fixture state, the tests verified both the backend's local-source path and the test manga's identity. Test writes were confined to the disposable library.

## Results

| Workflow | Result | Evidence checked |
|---|---|---|
| Browse local source → manga details → add to library → search library | PASS | Visible real title and two chapters; server `inLibrary=true`; filtered library card visible. |
| Create category and reload | PASS | Category visible in the dialog, returned by the real API, and visible after page reload. |
| Read page two and reload | PASS | Actual PNG decoded at 600px width, page-two UI visible, backend `lastPageRead=1`, and page two restored after reload. |
| Complete chapter and open history | PASS | Final image visible, backend `isRead=true`, and title visible in History. |
| Download chapter through the server | PASS | Web UI enqueued the real operation; backend `isDownloaded=true`; Downloads screen opened. This is server storage, not a browser-local offline copy. |
| Manual backup export | PASS, limited | Browser received an actual download; saved file was 358 bytes with gzip magic bytes. Restore and durability after restart/expiry were not tested. |
| G11: bookmark and immediately use the bookmarked chapter filter | FAIL, reproduced | Backend acknowledged `isBookmarked=true`, but the current filtered list showed no matching chapter. |
| G04: preserve completion while revisiting the start of a completed chapter | FAIL, reproduced | Controlled starting state was `isRead=true`, `lastPageRead=0`; opening page one emitted an automatic progress write and the backend returned `isRead=false`. |

The first complete run reported five passes and three failures. One failure was a test selector expecting a title once while the link's accessible name included both image text and visible text. The application had correctly displayed the result. After correcting that selector, the focused browsing/library run passed. The other two failures are real application-state mismatches and remain open. The failed run was retained rather than replaced.

No uncaught page errors were recorded by the checks. This does not establish that every optional integration or deployment works.

## Reproduced findings

### G04 — Automatic progress can clear completion

The browser test seeds the disposable chapter as completed at its first page, opens it in the real reader, waits for an acknowledged `UpdateChapterProgress` request, and reads the server record. Its read flag becomes false without an explicit mark-unread action.

`src/features/reader/ReaderPage.tsx:286` calculates `isRead` only from the selected page index. The outgoing mutation and local cache update use that result. Existing completion is not preserved. This verification covers completion regression when revisiting an earlier position; it does not prove that every ordinary reopen clears completion or runtime-test the separate failed-image completion concern.

The repair needs to preserve automatic completion while keeping explicit mark-unread/reset meaningful. Image readiness and ordered progress remain related contracts, as described in the parity audit.

### G11 — Successful bookmark leaves the preferred chapter query stale

The browser selects Chapter 1, applies Bookmark, confirms the server flag is true, and changes the current list filter to Bookmarked. The list stays empty for the assertion interval. The saved screenshot shows that empty state.

`src/features/manga/MangaDetailPage.tsx:111` owns the separate `manga-chapters` query. `src/features/manga/ChapterList.tsx:74` invalidates `manga` after bulk actions, leaving that preferred chapter list unchanged. Updating or invalidating the participating chapter query is the smallest repair to verify next.

## Evidence

All following paths are workspace-relative and ignored:

| Path | Contents |
|---|---|
| `.cache/runtime-check-2026-10-23/tauri-dev.log` | Actual native compilation and launch output |
| `.cache/runtime-check-2026-10-23/dev-server-host.log` | Running frontend output |
| `.cache/runtime-check-2026-10-23/backend-artifact.json` | JAR digest and byte verification |
| `.cache/runtime-check-2026-10-23/suwayomi-runtime.log` | Real backend startup and runtime output |
| `.cache/runtime-check-2026-10-23/live-inventory.json` | Real server/source/library inventory |
| `.cache/runtime-check-2026-10-23/live-local-browse.json` | Local-source discovery of the test manga |
| `.cache/runtime-check-2026-10-23/live-page-list.json`, `live-page-response.json` | Real page-list and HTTP PNG responses |
| `.cache/runtime-check-2026-10-23/playwright.live.config.ts`, `live-web.spec.ts` | Exact connected-web verification setup and assertions |
| `.cache/runtime-check-2026-10-23/live-browser-attempt1/` | All eight traces, failure screenshots, page snapshots and the downloaded backup |
| `.cache/runtime-check-2026-10-23/live-browser-attempt1.log` | Original five-pass/three-failure result |
| `.cache/runtime-check-2026-10-23/live-browser-attempt2/` and `.log` | Corrected focused browsing/library check; one pass |
| `.cache/runtime-check-2026-10-23/verified-runtime-state.json` | Final server state: title in library; Chapter 1 bookmarked/downloaded at page index 1; Chapter 2 incorrectly unread at index 0 |

Representative images were visually inspected:

- `live-browser-attempt1/live-web-paged-reading-per-0d7c4-o-and-restores-after-reload/live-reader.png`: the real test PNG on page two with matching reader position.
- `live-browser-attempt1/live-web-G11-successful-bo-5c325--the-current-chapter-filter/test-failed-1.png`: empty bookmarked list despite the acknowledged server bookmark.

## Scope still open

External source extensions, provider authentication/tracking, destructive restore, scheduled/pre-restore backup durability, offline progress replay, production PWA navigation, and complete native lifecycle behavior were not certified by these connected-web checks. The earlier unit/component and mocked/offline suites are separate evidence and are not substituted for these real-backend results.

This follow-up changed only ignored runtime-test artifacts and this report. It did not repair the two reproduced defects, modify production source, commit, push, or merge anything. The running app and test backend were left available for inspection.
