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
 * Comment cet appareil peut installer l'application :
 * - `invite`  : le navigateur fournit une invite native (Chrome, Edge).
 * - `ios`     : Safari iOS, où seul le geste Partager > Sur l'écran d'accueil existe.
 * - `manuel`  : tout le reste (Firefox…), où l'installation passe par le menu
 *               du navigateur, sans API pour la déclencher.
 */
export type ModeInstallation = "invite" | "ios" | "manuel";

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

/**
 * Edge ou Chrome desktop/Android, sans que `beforeinstallprompt` ait
 * (encore) été émis — typiquement parce qu'une invite précédente a déjà été
 * refusée sur ce site, et que le navigateur applique son propre délai avant
 * de la reproposer. Aucune API ne permet de forcer ce redéclenchement ; en
 * attendant, ce repérage sert uniquement à afficher, dans le mode `manuel`,
 * le chemin réel d'installation de CE navigateur plutôt qu'un message
 * générique valable pour n'importe lequel (voir InstallPrompt.tsx).
 *
 * N'est consulté que lorsque `modeInstallation` vaut déjà `manuel` (donc pas
 * iOS, où Edge/Chrome partagent de toute façon le mécanisme de Safari).
 * `OPR/` (Opera) exclu : son propre menu diffère, le message générique reste
 * plus honnête que d'indiquer un chemin qui n'existe pas chez lui.
 */
function detectChromiumSansInvite(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Edg\//.test(ua) || (/Chrome\//.test(ua) && !/OPR\//.test(ua));
}

/**
 * Capture de `beforeinstallprompt` au niveau du MODULE, et non dans le hook.
 *
 * Chrome émet cet événement au chargement de la page, dès que ses critères
 * d'installabilité sont réunis — c'est-à-dire pendant que l'utilisateur est
 * encore sur /connexion. Or `InstallPrompt` vit dans l'en-tête, qui n'est
 * monté qu'après authentification : un écouteur posé dans le hook arriverait
 * trop tard et l'événement serait perdu. Chrome se comporterait alors comme
 * un navigateur sans API d'installation.
 *
 * Ce module est chargé tôt (useAuthStore l'importe), donc l'écouteur est en
 * place bien avant que l'événement ne parte. Les hooks montés plus tard lisent
 * la valeur déjà capturée.
 */
let evenementDiffere: BeforeInstallPromptEvent | null = null;
const abonnes = new Set<(evenement: BeforeInstallPromptEvent | null) => void>();

function diffuser(): void {
  for (const abonne of abonnes) abonne(evenementDiffere);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sans preventDefault, Chrome affiche sa propre infobar et l'événement
    // n'est plus réutilisable pour déclencher l'invite au moment voulu.
    event.preventDefault();
    evenementDiffere = event as BeforeInstallPromptEvent;
    diffuser();
  });

  window.addEventListener("appinstalled", () => {
    evenementDiffere = null;
    diffuser();
  });
}

/** Vide l'événement après usage : il ne se consomme qu'une fois. */
function consommerEvenementDiffere(): void {
  evenementDiffere = null;
  diffuser();
}

/**
 * Le bouton de l'en-tête et la modale ne vivent plus au même endroit : la
 * modale est montée à la racine de l'application (pour exister avant
 * authentification), le bouton reste dans l'en-tête. Ce petit canal les relie
 * sans les faire dépendre l'un de l'autre.
 */
const ouvreurs = new Set<() => void>();

/** Appelé par le bouton de l'en-tête. */
export function demanderOuvertureInstallation(): void {
  for (const ouvrir of ouvreurs) ouvrir();
}

/** Abonne la modale aux demandes d'ouverture manuelle. */
export function useOuvertureInstallation(ouvrir: () => void): void {
  useEffect(() => {
    ouvreurs.add(ouvrir);
    return () => {
      ouvreurs.delete(ouvrir);
    };
  }, [ouvrir]);
}

export function useInstallPrompt() {
  // Valeur initiale lue depuis la capture du module : l'événement a
  // probablement déjà été émis quand ce hook se monte.
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => evenementDiffere,
  );
  const [justInstalled, setJustInstalled] = useState(false);
  const [isIOS] = useState(detectIOS);
  const [estChromiumSansInvite] = useState(detectChromiumSansInvite);

  // Lancée depuis l'écran d'accueil, l'app tourne en display-mode standalone.
  // Safari iOS ignore cette media query et expose `navigator.standalone` à la
  // place : il faut tester les deux.
  const standalone = useMediaQuery("(display-mode: standalone)");
  const iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  // S'abonne à la capture du module plutôt qu'à `window` directement : les
  // événements arrivés avant le montage sont ainsi déjà pris en compte.
  useEffect(() => {
    const abonne = (evenement: BeforeInstallPromptEvent | null) => setDeferredPrompt(evenement);
    abonnes.add(abonne);
    return () => {
      abonnes.delete(abonne);
    };
  }, []);

  // `appinstalled` reste écouté ici : il n'affecte pas l'événement différé
  // mais l'état « installée » propre à ce composant.
  useEffect(() => {
    const onAppInstalled = () => setJustInstalled(true);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => window.removeEventListener("appinstalled", onAppInstalled);
  }, []);

  const isInstalled = standalone || iosStandalone || justInstalled;

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredPrompt) return "unavailable";

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    // Un événement `beforeinstallprompt` ne se consomme qu'une fois : appeler
    // prompt() dessus une seconde fois lève une erreur. Si l'utilisateur a
    // refusé, Chrome en réémettra un nouveau quand il redeviendra éligible.
    // Vidé au niveau du module, pour que tous les abonnés soient à jour.
    consommerEvenementDiffere();
    return outcome;
  }, [deferredPrompt]);

  const modeInstallation: ModeInstallation =
    deferredPrompt !== null ? "invite" : isIOS ? "ios" : "manuel";

  return {
    /** Chrome/Edge/Android : l'invite native est prête à être déclenchée. */
    canPrompt: deferredPrompt !== null,
    isIOS,
    isInstalled,
    /** Quel chemin d'installation proposer sur cet appareil. */
    modeInstallation,
    /** Edge/Chrome sans invite disponible pour l'instant : affiner le
     * message générique du mode `manuel` avec le chemin réel de CE
     * navigateur, plutôt qu'un texte valable pour n'importe lequel. */
    estChromiumSansInvite,
    promptInstall,
  };
}
