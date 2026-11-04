# Privacy

Yomikura contains no project analytics, advertising SDK, account system, or telemetry endpoint.

This describes Yomikura's own data handling. Hosting, download, backend and source providers receive ordinary network requests and have their own policies; no project telemetry does not mean no network activity.

## Public homepage and demo

The [public website](https://yumekaz.github.io/Yomikura/) is hosted by GitHub Pages. GitHub receives requests for pages and assets, including ordinary connection information such as IP addresses; see [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Fonts and artwork are served with the site. The homepage has no project analytics, advertising pixels or third-party font service.

The site stores its appearance preference locally. The interactive demo uses the same GitHub Pages origin and can retain demo preferences and reading state in browser storage. It contains original sample stories and starts in demo mode; it is not your personal library. The standalone browser guide's optional address form opens your chosen server directly in another tab; it does not send that address to a Yomikura service. Avoid putting credentials or tokens in addresses.

GitHub Pages paths on the same owner domain share a browser origin, including browser storage; this is not a separate security boundary per project. Clearing site data can remove both website preferences and demo state. Personal libraries should use the desktop app or their own self-hosted web interface as described in the guide.

## Data stored locally

- Interface preferences and configured server profiles.
- On desktop, the current preference copy is retained in WebView storage and mirrored in order to the application's scoped settings file for recovery.
- Reading progress, pending reading/tracker synchronization, local download jobs, and offline chapter metadata/page bytes retained by the client.
- Book notes, device drafts and note export/import data. Explicitly saved notes synchronize as metadata to the selected Suwayomi library; device drafts stay local until saved.
- Native window preferences for capture protection, app lock and close-to-tray behavior, in the application's scoped configuration folder.
- Verified library backup artifacts retained on this device for export and recovery. These can include library metadata, categories and history.
- In desktop local-engine mode: the Suwayomi database, extensions, covers, downloads, logs, and optional private Java runtime in the selected storage folder.

## Network activity

Yomikura connects to the Suwayomi server selected by the user. Local-engine setup downloads pinned Java and Suwayomi releases from their official GitHub release locations. Update checks may contact GitHub's release API and release downloads for Yomikura or Suwayomi even when no comic source is opened. Opening a source website or help link contacts that destination. The public homepage reads download metadata from its own releases.json; it does not send reading history to a project backend.

Suwayomi and user-installed extensions may contact extension repositories, trackers and content sources configured by the user. Those services have their own policies and are outside Yomikura's control.

## Reading privacy controls

Incognito pauses new automatic reading progress, history and tracker activity. Explicit edits still work, earlier records remain saved, and previously queued reading progress may finish synchronizing. Incognito does not hide source requests or encrypt library files. Automatic tracker synchronization can be paused separately for each connected library, without discarding pending requests.

The privacy curtain hides the interface while its window is inactive. Supported desktop builds can exclude the window from supported screen captures. Windows app lock uses Windows Hello; Windows handles credentials and Yomikura receives only the verification result. These controls do not encrypt the underlying Suwayomi library, downloaded files or browser storage. Access to those files remains subject to the operating-system account and server configuration.

Optional tray mode keeps the desktop library engine running after the window closes. Choose Quit Yomikura from the tray to stop it.

## Deletion and uninstall

Uninstalling the desktop application removes the application but preserves a user-selected storage folder. Users can remove cached chapters or explicitly wipe managed local data from Settings. Yomikura does not receive a remote copy that must be deleted from a project server.

Clearing the selected server's offline cache removes that endpoint/mode's saved chapters and local download jobs. Other profiles' saved chapters, retained library backups, preferences and pending reading progress are separate stores and are not removed by this action. A Suwayomi library backup does not contain those independent client stores or downloaded page bytes.

Do not include passwords, access tokens, private server addresses, or personal files in bug reports.
