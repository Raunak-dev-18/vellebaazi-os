import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const RUNTIME_RECOVERY_FLAG = "__vb_runtime_recovered_once";
const SERVICE_WORKER_URL = "/sw.js?v=20260311-3";

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

const isKnownRuntimeMismatch = (message: string) =>
  message.includes("_jsxDEV is not a function") ||
  message.includes("Failed to fetch dynamically imported module");

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const maybeRecoverFromRuntimeMismatch = async (error: unknown) => {
  const message = toErrorMessage(error);
  if (!isKnownRuntimeMismatch(message)) return false;
  if (sessionStorage.getItem(RUNTIME_RECOVERY_FLAG) === "1") return false;
  if (!navigator.onLine) return false;

  sessionStorage.setItem(RUNTIME_RECOVERY_FLAG, "1");
  await clearServiceWorkersAndCaches();
  window.location.reload();
  return true;
};

const mountApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const bootstrap = async () => {
  if (
    import.meta.env.DEV &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    console.error(
      "Deployment appears to be running Vite dev mode on a non-local host. Use `npm run build` and `npm run start` for production.",
    );
  }

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
          .register(SERVICE_WORKER_URL)
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
