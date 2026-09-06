# Release signing checklist

Yomikura's updater metadata is signed with the Tauri updater key. That is separate from the platform trust users see when they download an installer.

## Windows

Windows SmartScreen trust requires a code-signing certificate issued for the publisher, or a configured Microsoft/Azure signing service. The certificate must be available to the release runner as a protected secret and the installer must be signed before it is published. A GitHub Actions token or the updater private key cannot replace this certificate.

## macOS

macOS distribution requires an Apple Developer signing identity plus notarization credentials. The release runner needs the Developer ID certificate, certificate password, Apple team ID, Apple ID, and an app-specific password (or an App Store Connect API key). The resulting app and DMG must be notarized and stapled before publishing.

## Current boundary

The release workflow can build and publish unsigned platform artifacts, and the Windows verification workflow now installs, launches, and uninstalls the NSIS package. Do not advertise the artifacts as platform-trusted until the credentials above are configured and a release run confirms SmartScreen/Gatekeeper behavior on clean machines.
