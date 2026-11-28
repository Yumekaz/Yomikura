import { useEffect, useRef, useState } from "react";

/** Native image requests need the same visibility gate that browsers apply to lazy images. */
export function useVisibleImage(lazy: boolean) {
  const ref = useRef<HTMLImageElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!lazy || near || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNear(true);
    }, { rootMargin: "240px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [lazy, near]);
  return { ref, ready: !lazy || near };
}
