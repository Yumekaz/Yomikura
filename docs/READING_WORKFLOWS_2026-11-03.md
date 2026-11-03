# Everyday reading and browser setup

This follow-up implements the workflows illustrated in fifteen additional private Mihon references. The images are local research material and are excluded from Git. The existing branding and React/Tauri/Suwayomi architecture remain in use. Beta.4 is the next candidate; the verified beta.3 release tag and draft are unchanged.

| Before | After | Why |
| --- | --- | --- |
| Returning desktop startup covered the library and offered Continue offline. | The library opens directly while the managed engine starts in the background. First-time component setup remains guided. | A returning reader should not choose a connectivity mode. |
| An unavailable server reduced the library to downloaded titles. | A complete successful library inventory, categories and viewed comic details are retained by server and verified library marker. | An undownloaded book still belongs to the library. |
| Cover rendering relied on the server or incidental HTTP caching. | Viewed covers have a library-scoped local copy. | Stored covers should survive a server outage without confusing another library's data. |
| Extension discovery required opening Extensions. | Configured stores are checked while the app is open; available updates have a notice, count and review filter. | Update discovery should not depend on remembering to visit a settings page. |
| History had no direct category-aware add action. | An outlined heart on a known non-library comic opens the shared add/category flow. | Reading history is independent of library membership. |
| Adding another source's version did not surface possible duplicates. | Similar titles prompt source-labelled review, Add anyway, Show entry, Copy or Migrate, with chapter/category choices. | A title match should invite a decision rather than silently replace an entry. |
| Browser setup depended on external instructions and a connection form. | `/setup` provides four illustrated steps, official links, a working connection form and recovery help. | Browser users need guidance inside the product. |

## Availability and data boundaries

Internet access and backend availability are separate. A local Suwayomi instance can remain usable without internet, including its library data and downloaded chapters. If that instance is unavailable, Yomikura can show retained metadata and open chapters whose bytes were saved on the device. Listing an unsaved chapter never makes its pages available offline: opening it still requires a reachable backend and, when necessary, its source. A failed request shows recovery without discarding the library.

Metadata snapshots contain only successfully read data. They are scoped to the normalized address and the verified library marker, never adopted across a replacement library or an unresolved restore. Full inventories are saved only after pagination completes and identity is verified. Authentication/GraphQL errors, invalid pagination and explicit cancellation do not become a successful stale read. Cache-write failure does not discard a successful live response. Metadata never substitutes for mutation acknowledgement.

Existing installations start retaining this additional metadata after successful reads in beta.4. Previously unseen details or covers cannot be reconstructed while disconnected. Browser/device storage can be cleared or evicted; retained metadata is an availability aid, not a backup. Chapter progress and existing library-isolation safeguards continue to use their established persistence and verification paths.

Extension notifications are in-app. Checks refresh only stores already configured by the reader, at most once per twelve hours unless explicitly retried; known update flags are refreshed periodically while open. They do not install extensions automatically or add a store. No OS notification permission, background Windows service or closed-app notification is introduced.

Duplicate matching uses normalized title equality/containment, with a minimum length for containment. It presents possible matches for review, not proof that two works are identical. Shared-tracker matching is outside this change. Copy preserves both entries. Migrate removes the original only after the existing transfer-verification checks pass; omitting chapter state cannot remove an original that still contains that state. Downloaded page bytes are not transferred between sources.

## Evidence and verification

Source behavior was checked against Mihon commit `3a64c8d65cf9fe44346a5994642db440c73aa70a`: `GetLibraryManga.kt`, `presentation/history/components/HistoryItem.kt`, `presentation/manga/DuplicateMangaDialog.kt`, `mihon/domain/migration/usecases/MigrateMangaUseCase.kt`, `ExtensionApi.kt`, `ExtensionUpdateNotifier.kt` and `ExtensionManager.kt`. Source inspection and the supplied images were sufficient for these workflows; no new APK/runtime REA investigation is claimed.

The browser guide links [Suwayomi's official installation instructions](https://github.com/Suwayomi/Suwayomi-Server#downloading-and-running-the-app) and [release downloads](https://github.com/Suwayomi/Suwayomi-Server/releases/latest). Illustrations are code-native explanatory diagrams, with complete dark/light palette support and keyboard-accessible links/forms.

## Completed verification

Implementation commit `e047f58e2765850f5f001c1eeea3b40d1f0a0360` passed all three jobs in [GitHub run 41656349105](https://github.com/Yumekaz/Yomikura/actions/runs/41656349105):

- 522 unit tests, including metadata isolation, cancellation, incomplete pagination, mutation separation, startup ownership and migration safeguards.
- 241 browser tests and the separate chapter-menu focus check. New journeys cover offline full-library recovery, saved versus unsaved chapters, extension discovery and explicit updates, History's heart/category action, duplicate review and transfer choices, guide connection failure/retry, and dark/light layouts with accessibility and overflow checks.
- 25 native Rust tests, formatting, Clippy and native compilation on Windows.
- 15 release-artifact tooling tests, synchronized versions, typechecking, production dependency audit and production build.
- Windows installer lifecycle, pinned private Java verification and real Suwayomi library identity/replacement/restore checks.

All application compilation and heavy builds ran on GitHub. The final browser build measured 3,212,045 total bytes and 1,118,665 JavaScript bytes. The bounded allowance was adjusted for the lazy setup page and the added reading workflows; artwork and largest-chunk limits remain unchanged. No new runtime dependency was added.

### Exact installed Windows candidate

The installer artifact came from that successful run. GitHub artifact ZIP SHA-256:

```text
165382a46860fce83aa2f66487160fb2647bdfdbd3bd92539e4e5375a24ff636
```

`Yomikura_1.0.25-beta.4_x64-setup.exe` is 6,403,450 bytes, SHA-256:

```text
3ab7f20743897696387b6434350f950926ade910efc22144e55108efacb14f96
```

The archive matched GitHub's recorded digest before extraction and execution. A normal Windows Explorer installation selected **Do not uninstall**, retained the existing destination and completed in place. About reported `1.0.25-beta.4` in the normal installed process.

Native results on the test laptop:

| Check | Observed result |
| --- | --- |
| Returning managed startup | Library opened directly while the local engine started in the background, then connected automatically. Continue offline was absent. |
| Original library preservation | One book, one device download, Chapter 2 / Page 4 and light Moonstone remained intact. |
| Isolated offline restart | With only the disposable server stopped, a normal shortcut cold launch retained all three library titles and covers, including an undownloaded comic. |
| Undownloaded chapter | Retained details still listed its chapter. Opening it showed readable connection recovery and a saved-chapters action; no missing pages were represented as downloaded. |
| Downloaded chapter | Five device records remained available. Saved chapter images and thumbnails rendered, restoring page 6 of 8 with the server stopped. |
| Reconnection | Pending progress cleared; a real server query confirmed `lastPageRead: 5` and `isRead: false` (displayed page 6). |
| Real-source History | Existing Asura reading showed one latest row per title and outlined hearts for non-library comics. Nano Machine's heart opened category assignment; cancelling left library membership unchanged. |
| End state | The original profile and Library were restored. Disposable QA helpers were confirmed no longer running; the normal local engine and internet connection were not interrupted by the outage test. |

### Visual review and limits

The GitHub-built guide was inspected in dark desktop and narrow light layouts. The guide remains usable without a backend, and its connection feedback survives profile changes. History's compact controls are visible and wrap with usable hit areas. The earlier browser preview initially retained its prior service-worker generation; its normal close/reopen update was applied and the active script hash checked before treating it as the corrected build.

Earlier failures are retained privately: a nullable-cover TypeScript diagnostic, the first bundle-budget overrun, two guide contrast labels, and guide feedback lost when switching profiles. The complete suite passed after their fixes; assertions were retained. A process-stop guard initially rejected locale-dependent timestamp parsing and made no change; the exact ISO start-time guard confirmed the disposable process before interruption. A temporary artifact-host connection failure was retried, then the installer archive digest was verified.

Coverage remains one installed Windows laptop plus GitHub runners. Copy/Migrate and extension update mutations received automated backend-fixture coverage and existing native identity/restore checks; this pass did not migrate the user's real Asura library or install a live extension update. OS notifications while closed, signed-in tracker providers, spoken screen-reader output, interactive macOS/Linux testing and forward automatic-update installation are outside this pass. Windows publisher signing remains unavailable. Existing [library identity limitations](LIBRARY_IDENTITY_2026-11-02.md) still apply.

The beta.4 source and report are pushed to `codex/reading-room`; no beta.4 release tag or public release was created. The previous beta.3 draft is preserved for review. Both screenshot folders, runtime data and raw failed evidence remain private and excluded from Git.
