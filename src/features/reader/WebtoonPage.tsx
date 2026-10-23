import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function WebtoonPage({ chapterId, pageIndex, forceVisible, onAnchor, onLayout, children }: {
  chapterId: number; pageIndex: number; forceVisible: boolean;
  onAnchor: (chapterId: number, index: number, element: HTMLDivElement | null) => void;
  onLayout: () => void; children: ReactNode;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState({ width: 0, height: 800 });
  const renderPage = near || forceVisible;
  const ref = useCallback((node: HTMLDivElement | null) => {
    element.current = node;
    onAnchor(chapterId, pageIndex, node);
  }, [chapterId, pageIndex, onAnchor]);
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: "1200px 0px", threshold: 0 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0) setWidth((previous) => Math.abs(previous - width) > 0.5 ? width : previous);
      if (renderPage && width > 0 && height > 0) setMeasured((previous) => Math.abs(previous.height - height) > 0.5 || Math.abs(previous.width - width) > 0.5 ? { width, height } : previous);
      onLayout();
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [renderPage, onLayout]);
  const placeholderHeight = measured.width && width ? measured.height * width / measured.width : measured.height;
  return <div ref={ref} data-reader-chapter={chapterId} data-reader-page={pageIndex}
    className="relative min-h-[100px] w-full bg-black"
    style={{ height: renderPage ? "auto" : `${Math.max(100, placeholderHeight)}px`, containIntrinsicSize: `auto ${placeholderHeight}px` }}>
    {renderPage ? children : <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="h-1 w-12 overflow-hidden rounded bg-white/10"><div className="h-full animate-pulse bg-yomi-jade/30" /></div></div>}
  </div>;
}
