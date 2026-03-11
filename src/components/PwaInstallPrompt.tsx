import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const PROMPT_DURATION_MS = 15_000;

const isPwaInstalled = () => {
  const isStandaloneDisplayMode = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const isIosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  const isTwa = document.referrer.startsWith("android-app://");

  return isStandaloneDisplayMode || isIosStandalone || isTwa;
};

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateInstallState = () => {
      setIsInstalled(isPwaInstalled());
    };

    updateInstallState();
    window.addEventListener("appinstalled", updateInstallState);

    return () => {
      window.removeEventListener("appinstalled", updateInstallState);
    };
  }, []);

  useEffect(() => {
    if (isInstalled) {
      setInstallPromptEvent(null);
      setIsVisible(false);
      return;
    }

    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setIsVisible(true);

      if (hideTimer) {
        clearTimeout(hideTimer);
      }

      hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, PROMPT_DURATION_MS);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setIsVisible(false);
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!installPromptEvent) {
      return;
    }

    await installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    setIsVisible(false);
  };

  if (isInstalled || !installPromptEvent || !isVisible) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-50">
      <Button onClick={handleInstall} size="sm" className="shadow-md">
        <Download className="h-4 w-4" />
        Install App
      </Button>
    </div>
  );
}
