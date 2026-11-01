import { useEffect, useRef, useState } from "react";
export function ReaderRefreshFlash({ enabled, position }: { enabled: boolean; position: string }) {
  const previous = useRef(position), lastFlash = useRef(0); const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(false); if (previous.current === position) return; previous.current = position; if (!enabled || Date.now() - lastFlash.current < 750) return; lastFlash.current = Date.now(); setVisible(true); const timer = setTimeout(() => setVisible(false), 90); return () => clearTimeout(timer); }, [enabled, position]);
  return visible ? <div className="yomi-reader-eink-refresh" aria-hidden="true" /> : null;
}
