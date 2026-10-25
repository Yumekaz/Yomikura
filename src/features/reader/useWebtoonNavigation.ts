import { useCallback, useEffect, useRef, useState } from "react";

export type ReaderCursor = { chapterId: number; pageIndex: number };
type LoadState = "loading" | "ready" | "error" | "unmounted";
type Anchor = ReaderCursor & { element: HTMLDivElement };
const key = (chapterId: number, pageIndex: number) => `${chapterId}:${pageIndex}`;

/** Stable wrapper anchors survive image virtualization and retain the owning chapter. */
export function useWebtoonNavigation(enabled: boolean, onSelect: (cursor: ReaderCursor, ready: boolean) => void) {
  const anchors = useRef(new Map<string, Anchor>());
  const visible = useRef(new Set<string>());
  const states = useRef(new Map<string, LoadState>());
  const observer = useRef<IntersectionObserver>();
  const callback = useRef(onSelect); callback.current = onSelect;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const active = useRef<ReaderCursor | null>(null);
  const fraction = useRef(0);
  const frame = useRef<number>();
  const jumpFrame = useRef<number>();
  const layoutVersion = useRef(0);
  const pending = useRef<(ReaderCursor & { fraction?: number; started: number; version: number; stable: number }) | null>(null);
  const [target, setTarget] = useState<ReaderCursor | null>(null);
  const [headerInset, setHeaderInset] = useState(80);
  const inset = useRef(80);
  const headerObserver = useRef<ResizeObserver>();

  const focusLine = () => Math.min(window.innerHeight - 20, inset.current + Math.min(120, Math.max(20, (window.innerHeight - inset.current) / 4)));
  const chooseVisible = useCallback(() => {
    if (!enabledRef.current || pending.current) return;
    const line = focusLine();
    const candidates = [...visible.current].map((id) => anchors.current.get(id)).filter((item): item is Anchor => !!item)
      .map((item) => ({ ...item, rect: item.element.getBoundingClientRect() })).filter((item) => item.rect.bottom > inset.current && item.rect.top < window.innerHeight);
    const selected = candidates.find((item) => item.rect.top <= line && item.rect.bottom > line)
      ?? candidates.sort((a, b) => Math.abs(a.rect.top - line) - Math.abs(b.rect.top - line))[0];
    if (!selected) return;
    active.current = { chapterId: selected.chapterId, pageIndex: selected.pageIndex };
    fraction.current = Math.max(0, Math.min(1, (line - selected.rect.top) / Math.max(1, selected.rect.height)));
    callback.current(active.current, states.current.get(key(selected.chapterId, selected.pageIndex)) === "ready");
  }, []);
  const onLayout = useCallback(() => {
    layoutVersion.current += 1;
    cancelAnimationFrame(frame.current ?? 0);
    frame.current = requestAnimationFrame(chooseVisible);
  }, [chooseVisible]);
  const onAnchor = useCallback((chapterId: number, pageIndex: number, element: HTMLDivElement | null) => {
    const id = key(chapterId, pageIndex);
    const old = anchors.current.get(id);
    if (old) observer.current?.unobserve(old.element);
    if (!element) { anchors.current.delete(id); visible.current.delete(id); return; }
    anchors.current.set(id, { chapterId, pageIndex, element });
    observer.current?.observe(element);
    onLayout();
  }, [onLayout]);

  const finish = useCallback(() => {
    pending.current = null; setTarget(null);
    cancelAnimationFrame(jumpFrame.current ?? 0);
    onLayout();
  }, [onLayout]);
  const jump = useCallback((chapterId: number, pageIndex: number, offset?: number) => {
    if (!enabledRef.current) return;
    cancelAnimationFrame(jumpFrame.current ?? 0);
    const request = { chapterId, pageIndex, fraction: offset, started: performance.now(), version: layoutVersion.current, stable: 0 };
    pending.current = request; setTarget({ chapterId, pageIndex });
    active.current = { chapterId, pageIndex };
    const align = () => {
      if (pending.current !== request || !enabledRef.current) return;
      const anchor = anchors.current.get(key(chapterId, pageIndex));
      if (anchor) {
        const rect = anchor.element.getBoundingClientRect();
        const desired = window.scrollY + rect.top + (request.fraction === undefined ? -inset.current : rect.height * request.fraction - focusLine());
        if (Math.abs(window.scrollY - Math.max(0, desired)) > 1) window.scrollTo({ top: Math.max(0, desired), behavior: "instant" });
        const current = anchor.element.getBoundingClientRect();
        const state = states.current.get(key(chapterId, pageIndex));
        if (current.bottom > inset.current && current.top < window.innerHeight) callback.current({ chapterId, pageIndex }, state === "ready");
        const waitingBefore = [...anchors.current.values()].some((item) => states.current.get(key(item.chapterId, item.pageIndex)) === "loading"
          && !!(item.element.compareDocumentPosition(anchor.element) & Node.DOCUMENT_POSITION_FOLLOWING));
        request.stable = request.version === layoutVersion.current ? request.stable + 1 : 0;
        request.version = layoutVersion.current;
        if ((state === "ready" || state === "error") && !waitingBefore && request.stable >= 2) { finish(); return; }
      }
      if (performance.now() - request.started > 12_000) { finish(); return; }
      jumpFrame.current = requestAnimationFrame(align);
    };
    jumpFrame.current = requestAnimationFrame(align);
  }, [finish]);

  const onImageState = useCallback((chapterId: number, pageIndex: number, state: LoadState) => {
    states.current.set(key(chapterId, pageIndex), state);
    onLayout();
  }, [onLayout]);
  const onHeaderRef = useCallback((element: HTMLDivElement | null) => {
    headerObserver.current?.disconnect();
    if (!element) return;
    const measure = () => {
      const next = Math.ceil(element.getBoundingClientRect().height) + 8;
      if (next > inset.current) { inset.current = next; setHeaderInset(next); onLayout(); }
    };
    headerObserver.current = new ResizeObserver(measure); headerObserver.current.observe(element); measure();
  }, [onLayout]);

  useEffect(() => {
    if (!enabled) { finish(); return; }
    observer.current = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = key(Number((entry.target as HTMLElement).dataset.readerChapter), Number((entry.target as HTMLElement).dataset.readerPage));
        if (entry.isIntersecting) visible.current.add(id); else visible.current.delete(id);
      }
      onLayout();
    }, { threshold: 0 });
    for (const anchor of anchors.current.values()) observer.current.observe(anchor.element);
    const resized = () => { const cursor = active.current; if (cursor && !pending.current) jump(cursor.chapterId, cursor.pageIndex, fraction.current); };
    const cancel = () => { if (pending.current) finish(); };
    window.addEventListener("scroll", onLayout, { passive: true });
    window.addEventListener("resize", resized);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("keydown", cancel, true);
    return () => {
      observer.current?.disconnect(); visible.current.clear();
      cancelAnimationFrame(frame.current ?? 0); cancelAnimationFrame(jumpFrame.current ?? 0);
      window.removeEventListener("scroll", onLayout); window.removeEventListener("resize", resized);
      window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel, true); window.removeEventListener("keydown", cancel, true);
    };
  }, [enabled, finish, jump, onLayout]);
  useEffect(() => () => headerObserver.current?.disconnect(), []);
  return { jump, cancel: finish, target, onAnchor, onLayout, onImageState, onHeaderRef, headerInset };
}
