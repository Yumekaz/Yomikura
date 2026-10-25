import { useEffect, useRef, type KeyboardEvent } from "react";
const controls = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
export function useModalFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null); const close = useRef(onClose); close.current = onClose;
  const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>(controls) ?? [])].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  const isTop = () => { const dialogs = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter((element) => element.getClientRects().length > 0); return dialogs[dialogs.length - 1] === ref.current; };
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement as HTMLElement | null;
    (focusable()[0] ?? ref.current).focus();
    const guard = (event: FocusEvent) => { if (isTop() && event.target instanceof Node && !ref.current?.contains(event.target)) (focusable()[0] ?? ref.current)?.focus(); };
    document.addEventListener("focusin", guard);
    return () => { document.removeEventListener("focusin", guard); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isTop() || event.defaultPrevented) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); return; }
    if (event.key !== "Tab") return;
    const items = focusable(); const first = items[0], last = items[items.length - 1];
    if (!first) { event.preventDefault(); ref.current?.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
  };
  return { ref, onKeyDown, tabIndex: -1 };
}
