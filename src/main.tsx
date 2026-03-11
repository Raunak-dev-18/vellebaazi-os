import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const RECOVERY_STORAGE_KEY = "__vb_runtime_recovery_v2";
const RECOVERY_PARAM = "vb-recover";
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;
const SERVICE_WORKER_URL = "/sw.js?v=20260311-2";

type RecoveryState = {
  attempts: number;
  firstAttemptAt: number;
};

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

const readRecoveryState = (): RecoveryState | null => {
  try {
    const raw = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryState;
    if (
      typeof parsed.attempts !== "number" ||
      typeof parsed.firstAttemptAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeRecoveryState = (state: RecoveryState) => {
  try {
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors.
  }
};

const clearRecoveryState = () => {
  try {
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const removeRecoveryQueryParam = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RECOVERY_PARAM)) return;
  url.searchParams.delete(RECOVERY_PARAM);
  window.history.replaceState({}, "", url.toString());
};

const maybeRecoverFromRuntimeMismatch = async (error: unknown) => {
  const message = toErrorMessage(error);
  if (!isKnownRuntimeMismatch(message)) return false;
  if (!navigator.onLine) return false;

  const now = Date.now();
  const previous = readRecoveryState();
  let nextState: RecoveryState = { attempts: 1, firstAttemptAt: now };

  if (previous && now - previous.firstAttemptAt < RECOVERY_WINDOW_MS) {
    if (previous.attempts >= RECOVERY_MAX_ATTEMPTS) {
      return false;
    }
    nextState = {
      attempts: previous.attempts + 1,
      firstAttemptAt: previous.firstAttemptAt,
    };
  }

  writeRecoveryState(nextState);
  await clearServiceWorkersAndCaches();

  const recoveryUrl = new URL(window.location.href);
  recoveryUrl.searchParams.set(RECOVERY_PARAM, String(now));
  window.location.replace(recoveryUrl.toString());
  return true;
};

const mountApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const bootstrap = async () => {
  const handleWindowError = (event: ErrorEvent) => {
    void maybeRecoverFromRuntimeMismatch(event.error ?? event.message);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    void maybeRecoverFromRuntimeMismatch(event.reason);
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

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

  clearRecoveryState();
  removeRecoveryQueryParam();

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
