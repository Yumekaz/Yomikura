# Privacy

Yomikura contains no project analytics, advertising SDK, account system, or telemetry endpoint.

## Data stored locally

- Interface preferences and configured server profiles.
- On desktop, the current preference copy is retained in WebView storage and mirrored in order to the application's scoped settings file for recovery.
- Reading progress, pending reading/tracker synchronization, local download jobs, and offline chapter metadata/page bytes retained by the client.
- Book notes, device drafts and note export/import data. Explicitly saved notes synchronize as metadata to the selected Suwayomi library; device drafts stay local until saved.
- Native window preferences for capture protection, app lock and close-to-tray behavior, in the application's scoped configuration folder.
- Verified library backup artifacts retained on this device for export and recovery. These can include library metadata, categories and history.
- In desktop local-engine mode: the Suwayomi database, extensions, covers, downloads, logs, and optional private Java runtime in the selected storage folder.

## Network activity

Yomikura connects to the Suwayomi server selected by the user. Local-engine setup downloads pinned Java and Suwayomi releases from their official GitHub release locations. Suwayomi and user-installed extensions may contact extension repositories, trackers, and content sources configured by the user. Those services have their own policies and are outside Yomikura's control.

## Reading privacy controls

Incognito pauses new automatic reading progress, history and tracker activity. Explicit edits still work, earlier records remain saved, and previously queued reading progress may finish synchronizing. Incognito does not hide source requests or encrypt library files. Automatic tracker synchronization can be paused separately for each connected library, without discarding pending requests.

The privacy curtain hides the interface while its window is inactive. Supported desktop builds can exclude the window from supported screen captures. Windows app lock uses Windows Hello; Windows handles credentials and Yomikura receives only the verification result. These controls do not encrypt the underlying Suwayomi library, downloaded files or browser storage. Access to those files remains subject to the operating-system account and server configuration.

Optional tray mode keeps the desktop library engine running after the window closes. Choose Quit Yomikura from the tray to stop it.

## Deletion and uninstall

Uninstalling the desktop application removes the application but preserves a user-selected storage folder. Users can remove cached chapters or explicitly wipe managed local data from Settings. Yomikura does not receive a remote copy that must be deleted from a project server.

Clearing the selected server's offline cache removes that endpoint/mode's saved chapters and local download jobs. Retained library backups, preferences and pending reading progress are separate stores and are not removed by this action. Client data is scoped by server address; different libraries reusing the same address are not guaranteed to be distinguished. A Suwayomi library backup does not contain those independent client stores or downloaded page bytes.

Do not include passwords, access tokens, private server addresses, or personal files in bug reports.
