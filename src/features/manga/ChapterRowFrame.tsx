import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ChapterRowFrame({ name, selected, selecting, read, bookmarked, busy, onRead, onBookmark, onSelect, children }: { name: string; selected: boolean; selecting: boolean; read: boolean; bookmarked: boolean; busy: boolean; onRead: () => void; onBookmark: () => void; onSelect: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number; id: number }>();
  const suppressClick = useRef(0);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} aria-busy={busy} className={`yomi-chapter-row ${selected ? "is-selected" : ""} ${open ? "has-open-menu" : ""}`} onContextMenu={(event) => { if (!selecting) { event.preventDefault(); setOpen(true); } }} onKeyDown={(event) => { if (!selecting && (event.key === "ContextMenu" || event.shiftKey && event.key === "F10")) { event.preventDefault(); setOpen(true); } }}
    onPointerDown={(event) => { if (event.pointerType === "touch" && !selecting && !busy && !(event.target as Element).closest("button,input")) start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; }}
    onPointerMove={(event) => { const initial = start.current; if (!initial || initial.id !== event.pointerId) return; const x = event.clientX - initial.x, y = event.clientY - initial.y; if (Math.abs(x) > 25 && Math.abs(x) > Math.abs(y) * 1.5) { event.currentTarget.setPointerCapture(event.pointerId); setDrag(Math.max(-100, Math.min(100, x))); } }}
    onPointerUp={(event) => { const initial = start.current; start.current = undefined; setDrag(0); if (!initial) return; const x = event.clientX - initial.x, y = event.clientY - initial.y; if (Math.abs(x) >= 75 && Math.abs(x) > Math.abs(y) * 1.5) { suppressClick.current = Date.now() + 400; if (x > 0) onRead(); else onBookmark(); } }}
    onPointerCancel={() => { start.current = undefined; setDrag(0); }} onClickCapture={(event) => { if (Date.now() < suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {drag !== 0 && <span className={`yomi-chapter-swipe-hint ${drag > 0 ? "is-read-action" : ""}`} aria-hidden="true">{drag > 0 ? read ? "Mark unread" : "Mark read" : bookmarked ? "Remove bookmark" : "Bookmark"}</span>}
    <div className="yomi-chapter-row-body" style={drag ? { transform: `translateX(${drag}px)` } : undefined}>{children}</div>
    {!selecting && <button ref={trigger} type="button" disabled={busy} className="yomi-icon-button yomi-chapter-more" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal /></button>}
    {open && !selecting && <div ref={menu} className="yomi-context-menu" role="menu" aria-label={`Actions for ${name}`} onKeyDown={(event) => { const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; if (["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (event.key === "Escape") close(); else { const current = items.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); } } }} onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) setOpen(false); }}>
      <button type="button" role="menuitem" disabled={busy} onClick={() => { close(); onRead(); }}>{read ? "Mark unread" : "Mark read"}</button><button type="button" role="menuitem" disabled={busy} onClick={() => { close(); onBookmark(); }}>{bookmarked ? "Remove bookmark" : "Bookmark"}</button><button type="button" role="menuitem" onClick={() => { setOpen(false); onSelect(); }}>Select chapter</button>
    </div>}
  </div>;
}
