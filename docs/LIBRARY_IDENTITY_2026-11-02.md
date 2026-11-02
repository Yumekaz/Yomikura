# Library identity work

## Backup lifecycle

New exports establish a marker using Suwayomi's authenticated global metadata API, record it beside the retained backup, and verify it after downloading and after writing the archive. Restore rechecks the safety copy's marker immediately before uploading. Scheduled backups require a matching marker and a readable retained file before trusting its timestamp. Address-only older copies cannot postpone a fresh scheduled export. Older archives and their notes remain exportable; no archive or old manifest is migrated or deleted.

The saved list shows matching, different, or unverified origins. The marker establishes continuity of the server's client metadata. It is not a cryptographically verified server identity: administrators can edit it, backups that include client data can carry it, and two clones can have identical values. Concurrent first-time clients can race because Suwayomi does not offer compare-and-set; the client reads back the retained value and verifies it around the operation, stopping on a changed value. A server replacement between verification and the actual HTTP request remains outside an atomic guarantee. A changed marker after storage fails the operation rather than claiming success; its retained archive is kept for recovery.

Evidence in the pinned Suwayomi source: `graphql/queries/MetaQuery.kt` (`metas`), `graphql/mutations/MetaMutation.kt` (`setGlobalMeta`), `global/impl/GlobalMeta.kt` (update-or-insert), and `manga/impl/backup/proto/handlers/BackupGlobalMetaHandler.kt` (conditional export and restore). Yomikura's native CI checks for the required query and mutation fields. Unit tests cover identity bootstrap/readback, unavailable metadata, changed markers during export/write, and recent archives from a different or unverified library. A browser fixture replaces a library marker at the same URL and preserves both labelled archives. These fixture checks do not substitute for two live databases or installed native verification.

## Remaining boundary work

Progress, tracking queues, device notes, offline chapters and download jobs still use endpoint-based scopes, with record-specific guards in several paths. This backup batch does not fix or certify them. In particular, device note snapshots retain the existing note scope and are not proof of origin; review their content before importing them into a replacement library.

A complete solution must retain legacy offline reading, quarantine pending actions rather than replay them under an unproven identity, account for simultaneous clients, distinguish a managed storage generation from copied server metadata, and give users an explicit path for a moved, restored or cloned library. Tests still needed include overlapping IDs and titles in two live libraries at one address, address changes, interrupted migration, real restore, and installed native checks. Do not report this larger task as complete based only on backup tests.
