import { moveManagedBookNotes } from "../../features/manga/bookNoteStorage";
import { rememberedLibrary } from "./librarySession";
import { moveManagedLibraryMetadata } from "./libraryMetadata";
import { type LibraryIdentity } from "./libraryIdentity";
import { isManagedLoopbackAddress, managedLibraryLocations, recordManagedLibraryLocation, type ManagedLibraryLocation } from "./managedLibraryLocations";
import { moveManagedOfflineRecords, normalizeCacheServerUrl } from "./offlineCache";
import { moveManagedProgress } from "./progressStorage";
import { pendingLibraryRestore } from "./restoreIdentity";

interface ManagedStartup {
  root: string;
  soleRegisteredRoot: boolean;
  returning: boolean;
  previousServer: string;
  server: string;
}

function verifyTargetRoot(root: string, marker?: string) {
  if (marker && managedLibraryLocations().some((location) => location.marker === marker && location.root !== root)) {
    throw new Error("This folder contains a copy of another managed library. Reopen its original folder before moving any device data.");
  }
}

export function confirmManagedLibraryLocation(root: string, server: string, identity: LibraryIdentity) {
  verifyTargetRoot(root, identity.marker);
  const current = managedLibraryLocations().find((location) => location.root === root);
  if (current?.movingTo) throw new Error("The local library’s earlier address change still needs to finish.");
  if (current?.server === server && current.marker === identity.marker) return;
  recordManagedLibraryLocation({ root, server, marker: identity.marker });
}

async function finishMove(location: ManagedLibraryLocation, to: string) {
  const { server: from, marker } = location;
  if (pendingLibraryRestore(from) || pendingLibraryRestore(to)) {
    throw new Error("Review the paused restore before moving the local library to another address.");
  }
  // Each store commits independently. The checkpoint gates writes from either
  // address and lets the same owned library repeat a partially finished move.
  recordManagedLibraryLocation({ ...location, movingTo: to });
  await moveManagedOfflineRecords(from, to, marker);
  await moveManagedProgress(from, to, marker);
  await moveManagedBookNotes(from, to, marker);
  await moveManagedLibraryMetadata(from, to, marker);
  const next = {
    root: location.root, server: to, marker,
    retired: [...new Set([...(location.retired ?? []), from])].filter((server) => server !== to),
  };
  recordManagedLibraryLocation(next);
  return next;
}

/** Called only with the location attested by Yomikura's running native child. */
export async function prepareManagedLibraryAddress(startup: ManagedStartup, identity: LibraryIdentity | undefined) {
  const { root, server } = startup;
  verifyTargetRoot(root, identity?.marker);
  let location = managedLibraryLocations().find((entry) => entry.root === root);
  if (location?.movingTo) {
    if (identity?.marker !== location.marker) {
      throw new Error("Reconnect the original local library to finish moving its saved data.");
    }
    location = await finishMove(location, location.movingTo);
  }
  if (!identity) return;
  if (!location && startup.returning && startup.soleRegisteredRoot) {
    const previous = normalizeCacheServerUrl(startup.previousServer);
    if (isManagedLoopbackAddress(previous) && rememberedLibrary(previous)?.marker === identity.marker) {
      location = { root, server: previous, marker: identity.marker };
    }
  }
  if (location?.marker === identity.marker && location.server !== server) await finishMove(location, server);
}
