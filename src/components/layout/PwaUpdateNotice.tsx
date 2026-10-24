import { useEffect, useState } from "react";
export function PwaUpdateNotice() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true; let cleanup = () => {};
    const inspect = async () => {
      const registration = await navigator.serviceWorker.getRegistration(); if (!active || !registration) return;
      cleanup(); const check = () => { if (active) setReady(!!registration.waiting && !!navigator.serviceWorker.controller); };
      const install = () => { check(); registration.installing?.addEventListener("statechange", check); };
      registration.addEventListener("updatefound", install); install();
      cleanup = () => { registration.removeEventListener("updatefound", install); registration.installing?.removeEventListener("statechange", check); };
    };
    void inspect().catch(() => undefined); window.addEventListener("yomikura:sw-ready", inspect);
    return () => { active = false; cleanup(); window.removeEventListener("yomikura:sw-ready", inspect); };
  }, []);
  return ready ? <p role="status" className="mb-4 rounded-lg border border-white/10 bg-ink-900 p-3 text-sm text-slate-300">An app update is ready. Close all Yomikura tabs and reopen to apply it. Your saved reading progress stays on this device.</p> : null;
}
