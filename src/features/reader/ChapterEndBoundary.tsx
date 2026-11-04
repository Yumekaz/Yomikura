import { useEffect, useRef } from "react";
/** Includes a scroll-past check so one large wheel movement cannot skip an end sentinel. */
export function ChapterEndBoundary({ onReached, readiness, bottomInset = 0 }: { onReached: () => void; readiness: number; bottomInset?: number }) {
  const element = useRef<HTMLDivElement>(null), callback = useRef(onReached); callback.current = onReached;
  useEffect(() => {
    const root = element.current; if (!root) return;
    let frame: number | undefined;
    const check = () => { if (root.getBoundingClientRect().top <= window.innerHeight - bottomInset + 2) callback.current(); };
    const scroll = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = requestAnimationFrame(check); };
    const observer = new IntersectionObserver(check); observer.observe(root); window.addEventListener("scroll", scroll, { passive: true }); check();
    return () => { observer.disconnect(); window.removeEventListener("scroll", scroll); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [readiness, bottomInset]);
  return <div ref={element} className="h-px w-full" aria-hidden="true" />;
}
