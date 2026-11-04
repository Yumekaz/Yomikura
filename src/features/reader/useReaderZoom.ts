import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

export const boundedReaderZoom = (value: number, disableZoomOut = false) => Math.max(disableZoomOut ? 1 : .5, Math.min(4, Number.isFinite(value) ? value : 1));
export type ReaderZoom = { scale: number; panX: number; setPanX: (value: number) => void; change: (value: number, x?: number, y?: number) => void; reset: () => void; suppressUntil: RefObject<number>; touchDoubleUntil: RefObject<number>; pinching: RefObject<boolean>; vertical: boolean };
export const ReaderZoomContext = createContext<ReaderZoom | null>(null);

/** One scale for the reading session, including pages mounted after scrolling. */
export function useReaderZoom(surface: RefObject<HTMLDivElement>, vertical: boolean, disableZoomOut: boolean, beforeChange?: () => void, doubleTapZoom = true) {
  const [mountedSurface, onSurfaceRef] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1), [panX, setPanX] = useState(0);
  const current = useRef(scale); current.current = scale;
  const currentPan = useRef(panX); currentPan.current = panX;
  const onBefore = useRef(beforeChange); onBefore.current = beforeChange;
  const suppressUntil = useRef(0);
  const touchDoubleUntil = useRef(0);
  const pinching = useRef(false);
  const anchor = useRef<{ element: HTMLElement; fraction: number; y: number }>();
  const change = useCallback((value: number, x?: number, y = window.innerHeight * .4) => {
    const next = boundedReaderZoom(value, disableZoomOut);
    if (Math.abs(next - current.current) < .0001) return;
    onBefore.current?.();
    const root = mountedSurface ?? surface.current;
    if (vertical && root && next > 1) {
      const rect = root.getBoundingClientRect(), ratio = next / current.current, offset = x === undefined ? 0 : rect.left + rect.width / 2 - x;
      const limit = Math.max(0, rect.width * (next - 1) / 2);
      const target = Math.max(-limit, Math.min(limit, currentPan.current * ratio + offset * (ratio - 1)));
      currentPan.current = target; setPanX(target);
    }
    if (vertical && root) {
      const pages = [...root.querySelectorAll<HTMLElement>("[data-reader-page]")];
      const element = pages.find((page) => { const rect = page.getBoundingClientRect(); return rect.top <= y && rect.bottom > y; });
      if (element) { const rect = element.getBoundingClientRect(); anchor.current = { element, fraction: (y - rect.top) / Math.max(1, rect.height), y }; }
    }
    suppressUntil.current = Date.now() + 350;
    current.current = next; setScale(next); if (next <= 1) { currentPan.current = 0; setPanX(0); }
  }, [surface, mountedSurface, vertical, disableZoomOut]);
  useLayoutEffect(() => {
    const saved = anchor.current; anchor.current = undefined;
    if (saved?.element.isConnected) { const rect = saved.element.getBoundingClientRect(); window.scrollBy({ top: rect.top + rect.height * saved.fraction - saved.y, behavior: "instant" }); }
  }, [scale]);
  useEffect(() => { if (disableZoomOut && current.current < 1) change(1); }, [disableZoomOut, change]);
  const reset = useCallback(() => { change(1); currentPan.current = 0; setPanX(0); }, [change]);
  const pan = useCallback((value: number) => { suppressUntil.current = Date.now() + 350; currentPan.current = value; setPanX(value); }, []);
  const state = useMemo(() => ({ scale, panX, setPanX: pan, change, reset, suppressUntil, touchDoubleUntil, pinching, vertical, onSurfaceRef }), [scale, panX, pan, change, reset, vertical]);
  useEffect(() => {
    const root = mountedSurface ?? surface.current; if (!root) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || (event.target as Element).closest("button,a,input,textarea")) return;
      event.preventDefault(); change(current.current * Math.exp(-event.deltaY * .002), event.clientX, event.clientY);
    };
    let pinch: { distance: number; scale: number } | undefined;
    let tap: { x: number; y: number; time: number } | undefined, previousTap: typeof tap;
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const start = (event: TouchEvent) => { if ((event.target as Element).closest("button,a,input,textarea")) return; if (event.touches.length === 2) { event.preventDefault(); pinching.current = true; tap = previousTap = undefined; pinch = { distance: Math.max(1, distance(event.touches)), scale: current.current }; suppressUntil.current = Date.now() + 500; } else if (event.touches.length === 1) tap = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }; };
    const move = (event: TouchEvent) => { if (pinch && event.touches.length === 2) { event.preventDefault(); change(pinch.scale * distance(event.touches) / pinch.distance, (event.touches[0].clientX + event.touches[1].clientX) / 2, (event.touches[0].clientY + event.touches[1].clientY) / 2); } else if (tap && event.touches.length && Math.hypot(event.touches[0].clientX - tap.x, event.touches[0].clientY - tap.y) > 8) tap = previousTap = undefined; };
    const end = (event: TouchEvent) => {
      pinching.current = false;
      if (event.type === "touchcancel") { tap = previousTap = undefined; pinch = undefined; return; }
      if (!pinch && tap && event.touches.length === 0 && Date.now() - tap.time < 250 && doubleTapZoom) {
        if (previousTap && tap.time - previousTap.time < 300 && Math.hypot(tap.x - previousTap.x, tap.y - previousTap.y) < 24) { event.preventDefault(); change(current.current === 1 ? 2 : 1, tap.x, tap.y); setPanX(0); touchDoubleUntil.current = Date.now() + 500; previousTap = undefined; }
        else previousTap = tap;
      }
      tap = undefined; pinch = undefined;
    };
    root.addEventListener("wheel", wheel, { passive: false });
    root.addEventListener("touchstart", start, { passive: false }); root.addEventListener("touchmove", move, { passive: false }); root.addEventListener("touchend", end, { passive: false }); root.addEventListener("touchcancel", end);
    return () => { pinching.current = false; root.removeEventListener("wheel", wheel); root.removeEventListener("touchstart", start); root.removeEventListener("touchmove", move); root.removeEventListener("touchend", end); root.removeEventListener("touchcancel", end); };
  }, [surface, mountedSurface, change, doubleTapZoom]);
  return state;
}
