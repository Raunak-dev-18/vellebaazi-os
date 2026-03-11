import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    const canRegisterServiceWorker =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost";

    if (canRegisterServiceWorker) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          console.error("Service worker registration failed:", error);
        });
      });
    }
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      })
      .catch(() => {
        // Ignore cleanup errors in development.
      });

    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => {
          keys.forEach((key) => {
            caches.delete(key);
          });
        })
        .catch(() => {
          // Ignore cache cleanup errors in development.
        });
    }
  }
}
