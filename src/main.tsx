import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "@fontsource-variable/inter";
import "@fontsource-variable/playfair-display";
import "./styles.css";
import { applyPalette, legacyPalette, paletteFor } from "./theme/palettes";

// Apply saved appearance before the first React paint. Native recovery can
// refine it later; local storage remains the authoritative immediate mirror.
try {
  const saved = JSON.parse(localStorage.getItem("yomikura-settings") || "null")?.state;
  const dark = saved?.themeMode !== "light" && (saved?.themeMode !== "system" || matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("light-theme", !dark);
  document.documentElement.classList.toggle("reduce-motion", saved?.reducedMotion === true);
  document.documentElement.classList.toggle("high-contrast", saved?.highContrastMode === true);
  applyPalette(document.documentElement, paletteFor(saved?.colorPalette ?? legacyPalette(saved?.accentColor)).id, dark);
} catch { applyPalette(document.documentElement, "ember", true); }

const runningInTauri = "__TAURI_INTERNALS__" in window;

// The website can use a service worker. The desktop bundle must never do so:
// an old worker can serve a stale UI after the native app has been upgraded.
if ("serviceWorker" in navigator && runningInTauri) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => {
      keys.filter((key) => /^yomikura-v\d+$/.test(key) || key.startsWith("yomikura-shell-")).forEach((key) => void caches.delete(key));
    });
  }
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        console.log("ServiceWorker registered successfully: ", reg.scope);
        window.dispatchEvent(new Event("yomikura:sw-ready"));
      })
      .catch((err) => {
        console.error("ServiceWorker registration failed: ", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
