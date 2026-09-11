import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Download,
  EllipsisVertical,
  Plus,
  Share,
  Smartphone,
  SquareArrowOutUpRight,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  demanderOuvertureInstallation,
  useInstallPrompt,
  useOuvertureInstallation,
} from "@/hooks/useInstallPrompt";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpeg";

const BENEFITS = [
  {
    icon: Zap,
    title: "Accès instantané",
    text: "Une icône sur votre écran d'accueil, sans passer par le navigateur.",
  },
  {
    icon: WifiOff,
    title: "Fonctionne sans connexion",
    text: "Consultez l'arbre et les fiches même quand le réseau manque.",
  },
  {
    icon: Smartphone,
    title: "Comme une vraie application",
    text: "En plein écran, sans barre d'adresse.",
  },
];

/** Laisse la page se dessiner avant de recouvrir l'écran : ouvrir la modale
 * immédiatement la ferait apparaître sur un écran encore vide. */
const DELAI_OUVERTURE_MS = 1500;

/** L'écran de connexion joue une séquence d'animation (formulaire à 0,9 s,
 * séparation à 1,85 s, machine à écrire à 3,05 s — voir Login.tsx). On attend
 * qu'elle se termine plutôt que de la recouvrir en plein milieu. */
const DELAI_OUVERTURE_CONNEXION_MS = 4000;

/**
 * Bouton d'accès manuel, dans l'en-tête. Séparé de la modale, qui est montée à
 * la racine de l'application pour exister avant authentification — voir
 * `InstallPromptDialog`.
 */
export function InstallButton() {
  const { isInstalled } = useInstallPrompt();
  if (isInstalled) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={demanderOuvertureInstallation}
      aria-label="Installer l'application"
    >
      <Download aria-hidden="true" />
    </Button>
  );
}

/**
 * Modale de proposition d'installation.
 *
 * Montée à la racine de l'application, hors des routes : elle doit exister
 * dès le lancement du site, y compris sur l'écran de connexion, avant toute
 * authentification. Elle ne bloque rien — l'utilisateur installe puis se
 * connecte, ou ferme et se connecte.
 *
 * Restant montée pendant que l'utilisateur s'authentifie, elle ne se rouvre
 * pas après la connexion : une seule apparition par chargement du site.
 *
 * Elle s'affiche sur tous les navigateurs, avec un contenu adapté au chemin
 * d'installation réellement disponible — seule l'application déjà installée
 * la fait disparaître.
 */
export function InstallPromptDialog() {
  const { isInstalled, canPrompt, modeInstallation, estChromiumSansInvite, promptInstall } =
    useInstallPrompt();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const instructionsChromiumRef = useRef<HTMLOListElement | null>(null);
  // Bref surlignage des instructions après un clic sans invite native — voir
  // handleInstall ci-dessous.
  const [instructionsEnEvidence, setInstructionsEnEvidence] = useState(false);

  // Ouverture manuelle, demandée par le bouton de l'en-tête.
  const ouvrir = useCallback(() => setOpen(true), []);
  useOuvertureInstallation(ouvrir);

  // Ouverture automatique à chaque chargement du site, tant que l'application
  // n'est pas installée sur CET appareil. Aucun refus n'est mémorisé.
  //
  // Le délai est décidé au montage, d'après la page d'entrée : plus long sur
  // l'écran de connexion, dont l'animation d'ouverture ne doit pas être
  // recouverte. Les dépendances excluent volontairement `pathname` — une
  // navigation ultérieure ne doit pas relancer le minuteur.
  useEffect(() => {
    if (isInstalled) return;
    const delai = pathname.startsWith("/connexion")
      ? DELAI_OUVERTURE_CONNEXION_MS
      : DELAI_OUVERTURE_MS;
    const minuteur = setTimeout(() => setOpen(true), delai);
    return () => clearTimeout(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstalled]);

  // Une installation aboutie referme la modale et la retire définitivement.
  useEffect(() => {
    if (isInstalled) setOpen(false);
  }, [isInstalled]);

  if (isInstalled) return null;

  async function handleInstall() {
    if (canPrompt) {
      await promptInstall();
      // On ferme quel que soit le choix : accepté, la modale n'a plus d'objet ;
      // refusé, insister serait pénible.
      setOpen(false);
      return;
    }

    // Edge/Chrome sans invite active pour l'instant : aucune API ne peut
    // déclencher l'installation depuis ce clic (voir useInstallPrompt.ts).
    // On ne ferme donc PAS la modale — ce serait faire croire à une
    // installation qui n'a pas eu lieu — et le clic reste utile : il amène
    // et met en évidence la marche à suivre réelle, déjà affichée juste
    // au-dessus. Le bouton n'est rendu dans ce cas que si
    // `estChromiumSansInvite` (voir plus bas) : cette marche à suivre existe
    // bien pour ce navigateur.
    instructionsChromiumRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setInstructionsEnEvidence(true);
    setTimeout(() => setInstructionsEnEvidence(false), 1600);
  }

  /** Fermeture sans installer. Rien n'est mémorisé : la modale se represente
   * au prochain lancement tant que l'application n'est pas installée. */
  function handleContinuer() {
    setOpen(false);
  }

  return (
    // Échap et clic à l'extérieur ferment la modale : c'est le comportement
    // par défaut de Radix, qui passe par `onOpenChange`.
    <Dialog open={open} onOpenChange={setOpen}>
        {/* `hideClose` : la croix par défaut du composant partagé est une icône
            de 16 px à 70 % d'opacité, trop petite pour un doigt. Celle-ci offre
            une zone de toucher de 40 px, pleinement visible. */}
        <DialogContent className="max-w-md" hideClose>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Fermer"
              className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </DialogClose>
          <DialogHeader className="pr-10">
            <div className="flex items-center gap-3">
              <img
                src={logo}
                alt=""
                aria-hidden="true"
                className="size-12 shrink-0 rounded-xl object-cover ring-2 ring-primary/30"
              />
              <DialogTitle className="text-balance">
                Installez Moussidalheire sur votre appareil
              </DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              Gardez la mémoire du village à portée de main, où que vous soyez.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-3">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* iOS : pas d'invite native, seulement la marche à suivre. */}
          {modeInstallation === "ios" && (
            <ol className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  1
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Appuyez sur
                  <Share className="size-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">Partager</span>, en bas de l'écran
                </span>
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  2
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Choisissez
                  <Plus className="size-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">Sur l'écran d'accueil</span>
                </span>
              </li>
            </ol>
          )}

          {/* Edge/Chrome, mais sans invite disponible pour l'instant — le plus
              souvent parce qu'une invite précédente a déjà été refusée sur ce
              site, et que le navigateur applique son propre délai avant de la
              reproposer. Aucune API ne permet de le forcer ; le chemin manuel
              d'Edge/Chrome, lui, reste toujours disponible. */}
          {modeInstallation === "manuel" && estChromiumSansInvite && (
            <ol
              ref={instructionsChromiumRef}
              className={cn(
                "space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4 transition-shadow",
                instructionsEnEvidence && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  1
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Cliquez sur
                  <SquareArrowOutUpRight className="size-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">l'icône d'installation</span>, à droite de la
                  barre d'adresse
                </span>
              </li>
              <li className="flex items-center gap-3 text-sm text-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  2
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Absente ? Ouvrez le menu
                  <EllipsisVertical className="size-4 text-primary" aria-hidden="true" />
                  puis <span className="font-medium">« Applications › Installer ce site »</span>
                </span>
              </li>
            </ol>
          )}

          {/* Tout le reste (Firefox…) : aucune API d'installation, on
              explique le chemin manuel générique plutôt que d'afficher un
              bouton sans effet. */}
          {modeInstallation === "manuel" && !estChromiumSansInvite && (
            <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <EllipsisVertical className="size-4.5" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">
                Votre navigateur n'ouvre pas d'assistant d'installation. Ouvrez son menu, puis
                cherchez <span className="font-medium text-foreground">« Installer »</span> ou{" "}
                <span className="font-medium text-foreground">« Ajouter à l'écran d'accueil »</span>.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {/* Bouton à contour plutôt que simple texte : l'utilisateur doit
                repérer d'emblée comment poursuivre sans installer. */}
            <Button variant="outline" onClick={handleContinuer}>
              Continuer
            </Button>
            {/* Visible dès qu'un clic a une action réelle à accomplir : soit
                l'invite native (canPrompt), soit — à défaut — amener aux
                instructions Edge/Chrome (estChromiumSansInvite). Absent sur
                iOS et les navigateurs génériques (Firefox…), où aucune des
                deux n'existe : le bouton y serait mort, ce qui est pire que
                son absence. */}
            {(canPrompt || estChromiumSansInvite) && (
              <Button onClick={() => void handleInstall()}>
                <Download aria-hidden="true" />
                Télécharger et installer
              </Button>
            )}
          </div>
      </DialogContent>
    </Dialog>
  );
}
