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

Focused local tests passed for metadata, extension discovery, migration, duplicate handling and returning startup. Full application/type/build/browser/native verification runs on GitHub. Final run IDs, outcomes, visual review and any installed beta.4 checks will be recorded here once completed; earlier failed logs are retained privately. No public release publication is authorized by this implementation checkpoint.
