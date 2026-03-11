import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const SW_RECOVERY_FLAG = "__vb_sw_recovered_once";

const clearServiceWorkersAndCaches = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Ignore cleanup errors.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {
      // Ignore cleanup errors.
    }
  }
};

const maybeRecoverFromRuntimeMismatch = async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const isKnownMismatch =
    message.includes("_jsxDEV is not a function") ||
    message.includes("Failed to fetch dynamically imported module");

  if (!isKnownMismatch) return false;
  if (sessionStorage.getItem(SW_RECOVERY_FLAG) === "1") return false;

  sessionStorage.setItem(SW_RECOVERY_FLAG, "1");
  await clearServiceWorkersAndCaches();
  window.location.reload();
  return true;
};

const mountApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const bootstrap = async () => {
  if (!import.meta.env.PROD) {
    await clearServiceWorkersAndCaches();
  }

  try {
    mountApp();
  } catch (error) {
    const recovered = await maybeRecoverFromRuntimeMismatch(error);
    if (!recovered) {
      throw error;
    }
    return;
  }

  if ("serviceWorker" in navigator) {
    const canRegisterServiceWorker =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost";

    if (canRegisterServiceWorker) {
      window.addEventListener("load", () => {
        if (!import.meta.env.PROD) return;

        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => registration.update())
          .catch((error) => {
            console.error("Service worker registration failed:", error);
          });
      });
    }
  }
};

bootstrap().catch((error) => {
  console.error("App bootstrap failed:", error);
});
