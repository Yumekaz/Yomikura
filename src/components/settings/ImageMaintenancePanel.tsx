import { useState } from "react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useProgressBackend } from "../../hooks/useProgressSynchronization";
import { isSelectedLibrary } from "../../api/suwayomi/libraryUpdateState";
import { useFeedback } from "../ui/FeedbackProvider";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
export function ImageMaintenancePanel() {
  const backend = useProgressBackend();
  return backend ? <ImageMaintenance key={backend.key} backend={backend} /> : null;
}
function ImageMaintenance({ backend }: { backend: ProgressBackend }) {
  const { confirm } = useFeedback(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const clear = async (covers: boolean) => {
    if (!backend || busy || !await confirm({ title: covers ? "Refresh library covers?" : "Clear temporary images?", detail: covers ? "The connected library will fetch covers again when you browse. Downloaded chapter files, device copies, notes and progress stay saved." : "Only temporary page and thumbnail images on the connected library are cleared. Downloaded chapter files and device copies stay saved.", confirmLabel: covers ? "Refresh covers" : "Clear temporary images" })) return;
    if (!isSelectedLibrary(backend)) return;
    setBusy(true); setMessage("");
    try {
      const id = crypto.randomUUID(), result = (await createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, { libraryId: backend.libraryId ?? null }, backend.isDemo ? "demo" : "live").ClearTemporaryLibraryImages({ input: { clientMutationId: id, cachedPages: !covers, cachedThumbnails: true, downloadedThumbnails: covers } }, undefined, AbortSignal.timeout(30000))).clearCachedImages;
      if (result.clientMutationId !== id || result.cachedThumbnails !== true || (covers ? result.downloadedThumbnails !== true : result.cachedPages !== true)) throw new Error("Unconfirmed cleanup");
      if (isSelectedLibrary(backend)) setMessage(covers ? "Covers will be fetched again as you browse." : "Temporary library images cleared. Your saved chapters are kept.");
    } catch { if (isSelectedLibrary(backend)) setMessage("Your library couldn’t confirm the cleanup. Reconnect and try again; an older engine may not support it."); }
    finally { setBusy(false); }
  };
  return <section className="yomi-reader-preferences" aria-labelledby="image-maintenance-title"><h2 id="image-maintenance-title">Image maintenance</h2><p>Refresh source images without removing your books or saved chapters.</p><div className="mt-4 flex flex-wrap gap-3"><button className="yomi-button yomi-button-secondary" disabled={!backend || busy} onClick={() => void clear(false)}>Clear temporary library images</button><button className="yomi-button yomi-button-secondary" disabled={!backend || busy} onClick={() => void clear(true)}>Refresh library covers</button></div>{(busy || message) && <p role="status" className="!mb-0 mt-3 text-xs">{busy ? "Waiting for your library to confirm…" : message}</p>}</section>;
}
