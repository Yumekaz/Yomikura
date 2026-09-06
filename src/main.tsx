import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "@fontsource-variable/inter";
import "./styles.css";

const runningInTauri = "__TAURI_INTERNALS__" in window;

// The website can use a service worker. The desktop bundle must never do so:
// an old worker can serve a stale UI after the native app has been upgraded.
if ("serviceWorker" in navigator && runningInTauri) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => {
      keys.filter((key) => key.startsWith("yomikura-v")).forEach((key) => void caches.delete(key));
    });
  }
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("ServiceWorker registered successfully: ", reg.scope);
      })
      .catch((err) => {
        console.error("ServiceWorker registration failed: ", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
