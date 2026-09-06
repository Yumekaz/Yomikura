# Privacy

Yomikura contains no project analytics, advertising SDK, account system, or telemetry endpoint.

## Data stored locally

- Interface preferences and configured server profiles.
- Reading progress and offline chapter metadata cached by the client.
- In desktop local-engine mode: the Suwayomi database, extensions, covers, downloads, logs, and optional private Java runtime in the selected storage folder.

## Network activity

Yomikura connects to the Suwayomi server selected by the user. Local-engine setup downloads pinned Java and Suwayomi releases from their official GitHub release locations. Suwayomi and user-installed extensions may contact extension repositories, trackers, and content sources configured by the user. Those services have their own policies and are outside Yomikura's control.

## Deletion and uninstall

Uninstalling the desktop application removes the application but preserves a user-selected storage folder. Users can remove cached chapters or explicitly wipe managed local data from Settings. Yomikura does not receive a remote copy that must be deleted from a project server.

Do not include passwords, access tokens, private server addresses, or personal files in bug reports.
