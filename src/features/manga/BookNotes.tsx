import { useEffect, useMemo, useRef, useState } from "react";
import { createGraphqlClient } from "../../api/graphql/client";
import type { ProgressBackend } from "../../api/suwayomi/backendIdentity";
import { acknowledgeBookNote, BOOK_NOTE_KEY, bookNoteScope, getBookNoteDraft, noteHasConflict, remoteNote, saveBookNoteDraft, type BookNoteDraft } from "./bookNoteStorage";

export function BookNotes({ backend, mangaId, title }: { backend: ProgressBackend; mangaId: number; title: string }) {
  const [open, setOpen] = useState(false);
  return <details className="yomi-book-notes yomi-content-surface" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>My notes<span>Thoughts, reminders and little details</span></summary>{open && <NotesEditor key={bookNoteScope(backend, mangaId, title)} backend={backend} mangaId={mangaId} title={title} />}</details>;
}
function NotesEditor({ backend, mangaId, title }: { backend: ProgressBackend; mangaId: number; title: string }) {
  const key = bookNoteScope(backend, mangaId, title);
  const sdk = useMemo(() => createGraphqlClient(`${backend.serverBaseUrl}/api/graphql`, undefined, backend.isDemo ? "demo" : "live"), [backend]);
  const [value, setValue] = useState("");
  const [base, setBase] = useState<string | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("Loading your note…"), [conflict, setConflict] = useState<string>();
  const latest = useRef<BookNoteDraft>();
  const writes = useRef<Promise<void>>(Promise.resolve());
  const persist = (draft: BookNoteDraft) => { const pending = writes.current.catch(() => undefined).then(() => saveBookNoteDraft(draft)); writes.current = pending; return pending; };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void (async () => {
      const [local, remote] = await Promise.allSettled([getBookNoteDraft(key), sdk.GetMangaNotes({ id: mangaId }, undefined, AbortSignal.timeout(10_000))]);
      if (cancelled) return;
      const saved = local.status === "fulfilled" ? local.value : undefined;
      const server = remote.status === "fulfilled" ? remoteNote(remote.value.manga.meta) : null;
      if (saved?.pending) { latest.current = saved; setValue(saved.value); setBase(saved.base); setMessage("Saved on this device. Sync when you’re ready."); }
      else { setValue(server ?? saved?.value ?? ""); setBase(server); setMessage(server === null ? "Your library is unavailable. You can save a note on this device." : "Notes are saved to your connected library."); }
      if (local.status === "rejected") setMessage("Note storage is unavailable. Keep a copy of anything you type until storage is restored.");
      setReady(true);
    })();
    return () => { cancelled = true; alive.current = false; };
  }, [key, mangaId, sdk]);
  const edit = (text: string) => {
    setValue(text); setConflict(undefined); setMessage("Saving on this device…");
    const draft = { key, value: text, base, pending: true, revision: crypto.randomUUID() }; latest.current = draft;
    void persist(draft).then(() => { if (alive.current && latest.current?.revision === draft.revision) setMessage("Saved on this device. Sync to keep it with your library."); }).catch(() => { if (alive.current) setMessage("Your note could not be saved. Keep a copy and try again."); });
  };
  const save = async (overwrite = false) => {
    setBusy(true); setMessage("Saving your note…");
    const draft: BookNoteDraft = { key, value, base, pending: true, revision: crypto.randomUUID() }; latest.current = draft;
    try {
      await persist(draft);
      try {
        const remote = remoteNote((await sdk.GetMangaNotes({ id: mangaId }, undefined, AbortSignal.timeout(10_000))).manga.meta);
        if (noteHasConflict(draft, remote) && (!overwrite || remote !== conflict)) { if (alive.current) { setConflict(remote); setMessage("Your library has a different note. Both versions are kept below for review."); } return; }
        const result = await sdk.SaveMangaNote({ input: { meta: { mangaId, key: BOOK_NOTE_KEY, value } } }, undefined, AbortSignal.timeout(10_000));
        if (result.setMangaMeta?.meta.value !== value || result.setMangaMeta.meta.mangaId !== mangaId || result.setMangaMeta.meta.key !== BOOK_NOTE_KEY) throw new Error("The library did not confirm the saved note.");
        const acknowledged = await acknowledgeBookNote(draft);
        if (acknowledged) latest.current = { ...draft, pending: false, base: value };
        if (alive.current) { setBase(value); setConflict(undefined); setMessage(acknowledged ? "Saved to your library and this device." : "Your library saved this version. A newer device edit is still waiting to sync."); }
      } catch { if (alive.current) setMessage("Saved on this device. Your library couldn’t be reached; try Sync note again when connected."); }
    } catch { if (alive.current) setMessage("Your note could not be saved. Keep a copy and try again."); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="yomi-note-editor"><label htmlFor={`note-${mangaId}`}>A note for {title}</label><textarea id={`note-${mangaId}`} rows={5} maxLength={20000} disabled={!ready || busy} value={value} onChange={(event) => edit(event.target.value)} placeholder="Leave a thought for your next visit…" className="yomi-field" /><div className="yomi-note-status"><p role="status">{message}</p><button className="yomi-button yomi-button-secondary" disabled={!ready || busy} onClick={() => void save()}>Sync note</button></div>{conflict !== undefined && <div className="yomi-note-conflict"><h3>Note in your library</h3><p>{conflict || "(Empty note)"}</p><div className="flex flex-wrap gap-2"><button className="yomi-button yomi-button-secondary" disabled={busy} onClick={async () => { const draft = { key, value: conflict, base: conflict, pending: false, revision: crypto.randomUUID() }; await saveBookNoteDraft(draft); latest.current = draft; setValue(conflict); setBase(conflict); setConflict(undefined); setMessage("Using the note from your library."); }}>Use library note</button><button className="yomi-button yomi-button-secondary" disabled={busy} onClick={() => void save(true)}>Replace library note with mine</button></div></div>}</div>;
}
