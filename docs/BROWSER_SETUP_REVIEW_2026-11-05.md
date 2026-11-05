# Browser setup review — 2026-11-05

## Manual Windows observations

The public guide was followed with the official Suwayomi v2.4.2366 Windows ZIP and the public Yomikura v1.0.25 web download. The ZIP digest matched the official release. A separate test data directory was selected; normal library data and private reference images were excluded.

The manual journey reached a real Asura Scans catalog and chapter through an explicitly approved Keiyoushi store. The reader decoded pages, a book was added to the library, and membership survived a server restart. This establishes a working journey, not a pristine beginner installation: the browser had earlier site state, native automation required user handoffs at Windows warnings, and test servers were stopped by process termination rather than their tray command.

Two observations remain distinct from confirmed defects:

- A page-3 position later resumed at page 2 after forced server termination. Repeating page 3 → book details → resume without terminating the server restored page 3. The cause of the earlier discrepancy is unresolved. No monotonic-progress workaround was added: readers must still be able to move backward deliberately, reset or mark unread.
- A waiting-update notice appeared in a browser that already had Yomikura state. This is not evidence of a first-install defect. Fresh-browser installation and waiting-generation behavior are tested separately.

## Guide corrections

- Windows steps identify `windows-x64.zip`, Extract All, the possible nested folder and `Suwayomi Launcher.bat`. They distinguish the ZIP from MSI installation and the launcher JAR.
- Publisher-warning help asks readers to verify the official download and make their own trust decision. It does not instruct them to disable Windows protection.
- Existing-library guidance explains the launcher root picker, exact data-folder selection, backup preservation and the distinction between extracted program files and persistent library files.
- The ordinary WebUI path includes More → Settings. Same-computer setup explains the loopback address and restart requirement. Windows shutdown uses the Suwayomi tray menu's Quit command; closing a browser tab is not shutdown.
- Recovery help explains why another open tab can retain an older PWA generation, without recommending that readers erase site data.

Source checks: [official release assets](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366), [installation instructions](https://github.com/Suwayomi/Suwayomi-Server#downloading-and-running-the-app), [data-directory guide](https://github.com/Suwayomi/Suwayomi-Server/wiki/The-data-directory), and the pinned [tray Quit implementation](https://github.com/Suwayomi/Suwayomi-Server/blob/v2.4.2366/server/src/main/kotlin/suwayomi/tachidesk/server/util/SystemTray.kt).

## Verification added in this batch

- Public guide checks cover the actual Windows ZIP/launcher path, existing-library guidance, folder help and its copy action. Existing desktop/mobile theme, overflow and accessibility checks remain in place.
- Reader regression coverage waits for a middle-page backend acknowledgement, then leaves, reopens and reloads the reader. Intentional backward reading is checked too.
- The real-server web-guide harness uses four original-art pages, acknowledges page 3, reloads, gracefully restarts pinned Suwayomi and resumes from an entirely fresh browser. It also checks first-install update notices and a subsequent intentional move to page 2. This runs against both pinned server versions; it does not automate the Windows launcher or certify abrupt power-loss durability.

These additions require passing GitHub execution before they are reported as verified. The public web archive continues to come from the reviewed release commit; changing this guide does not silently replace the released app with unreleased source.
