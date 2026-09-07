import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * `beforeinstallprompt` n'existe pas dans la lib DOM de TypeScript : l'API
 * n'est pas standardisée (Chromium uniquement), d'où cette déclaration locale.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Safari iOS n'expose ni `beforeinstallprompt` ni la moindre API
 * d'installation : le seul chemin est manuel (Partager > Sur l'écran
 * d'accueil). D'où le reniflage d'user agent, faute d'alternative fiable —
 * on ne peut pas détecter cette absence par feature detection.
 *
 * `MSStream` écarte les anciens IE mobile, qui se déclaraient « like iPhone ».
 */
function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [isIOS] = useState(detectIOS);

  // Lancée depuis l'écran d'accueil, l'app tourne en display-mode standalone.
  // Safari iOS ignore cette media query et expose `navigator.standalone` à la
  // place : il faut tester les deux.
  const standalone = useMediaQuery("(display-mode: standalone)");
  const iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Sans preventDefault, Chrome affiche sa propre infobar et l'événement
      // n'est plus réutilisable pour déclencher l'invite au moment voulu.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setJustInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const isInstalled = standalone || iosStandalone || justInstalled;

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredPrompt) return "unavailable";

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // Un événement `beforeinstallprompt` ne se consomme qu'une fois : appeler
    // prompt() dessus une seconde fois lève une erreur. Si l'utilisateur a
    // refusé, Chrome en réémettra un nouveau quand il redeviendra éligible.
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  return {
    /** Chrome/Edge/Android : l'invite native est prête à être déclenchée. */
    canPrompt: deferredPrompt !== null,
    isIOS,
    isInstalled,
    /** Y a-t-il quelque chose à proposer à l'utilisateur ? */
    canInstall: !isInstalled && (deferredPrompt !== null || isIOS),
    promptInstall,
  };
}
