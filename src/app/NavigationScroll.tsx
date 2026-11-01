import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Non-reader routes restore their history entry. The reader owns its page/chapter anchors. */
export function NavigationScroll() {
  const location = useLocation(), navigation = useNavigationType();
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const current = useRef({ key: location.key, reader: location.pathname.startsWith("/reader/") });
  const restoring = useRef(false);
  useEffect(() => {
    const previous = history.scrollRestoration; history.scrollRestoration = "manual";
    const remember = () => {
      if (current.current.reader || restoring.current) return;
      positions.current.set(current.current.key, { x: window.scrollX, y: window.scrollY });
      if (positions.current.size > 100) positions.current.delete(positions.current.keys().next().value!);
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { history.scrollRestoration = previous; window.removeEventListener("scroll", remember); };
  }, []);
  useLayoutEffect(() => {
    current.current = { key: location.key, reader: location.pathname.startsWith("/reader/") };
    if (current.current.reader) return;
    const wanted = navigation === "POP" ? positions.current.get(location.key) : undefined;
    if (!wanted?.y) { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); return; }
    // A lazy route may initially be shorter than the remembered position.
    restoring.current = true; let frame = 0, cancelled = false, stable = 0;
    const started = performance.now();
    const stop = () => { cancelled = true; restoring.current = false; cancelAnimationFrame(frame); };
    const align = () => {
      if (cancelled) return;
      window.scrollTo({ left: wanted.x, top: wanted.y, behavior: "instant" });
      stable = Math.abs(window.scrollY - wanted.y) < 2 ? stable + 1 : 0;
      if (stable >= 2 || performance.now() - started > 3000) { stop(); return; }
      frame = requestAnimationFrame(align);
    };
    frame = requestAnimationFrame(align);
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((event) => window.addEventListener(event, stop, { passive: true }));
    return () => { stop(); events.forEach((event) => window.removeEventListener(event, stop)); };
  }, [location.key, location.pathname, navigation]);
  return null;
}
