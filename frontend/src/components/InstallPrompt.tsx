import { useEffect, useState } from "react";
import { Download, EllipsisVertical, Plus, Share, Smartphone, WifiOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
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

/** Laisse la page d'accueil se dessiner avant de recouvrir l'écran : ouvrir la
 * modale immédiatement après la redirection la ferait apparaître sur un écran
 * encore vide. */
const DELAI_OUVERTURE_MS = 1500;

/**
 * Bouton d'installation de la PWA + sa modale explicative.
 *
 * La modale s'ouvre d'elle-même après une connexion réussie, et reste
 * accessible à tout moment par le bouton de l'en-tête. Elle s'affiche sur tous
 * les navigateurs, avec un contenu adapté au chemin d'installation réellement
 * disponible — seule l'application déjà installée la fait disparaître.
 */
export function InstallPrompt() {
  const { isInstalled, canPrompt, modeInstallation, promptInstall } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  // Ouverture automatique à chaque ouverture de l'application, tant qu'elle
  // n'est pas installée sur CET appareil. Aucun refus n'est mémorisé : c'est
  // le comportement demandé.
  //
  // Le déclencheur est le montage de ce composant, qui vit dans l'en-tête,
  // donc dans `AppShell` : il n'existe pas sur /connexion (aucune modale avant
  // authentification) et ne se remonte pas d'une page à l'autre, `AppShell`
  // restant en place autour de l'`Outlet`. La modale s'ouvre donc une fois par
  // chargement de l'application, pas à chaque navigation.
  useEffect(() => {
    if (isInstalled) return;
    const minuteur = setTimeout(() => setOpen(true), DELAI_OUVERTURE_MS);
    return () => clearTimeout(minuteur);
  }, [isInstalled]);

  // Une installation aboutie referme la modale et la retire définitivement.
  useEffect(() => {
    if (isInstalled) setOpen(false);
  }, [isInstalled]);

  if (isInstalled) return null;

  async function handleInstall() {
    await promptInstall();
    // On ferme quel que soit le choix : accepté, la modale n'a plus d'objet ;
    // refusé, insister serait pénible.
    setOpen(false);
  }

  /** Fermeture sans installer. Rien n'est mémorisé : la modale se represente
   * au prochain lancement tant que l'application n'est pas installée. */
  function handleContinuer() {
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Installer l'application"
      >
        <Download aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
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

          {/* Firefox et consorts : aucune API d'installation, on explique le
              chemin manuel plutôt que d'afficher un bouton sans effet. */}
          {modeInstallation === "manuel" && (
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
            <Button variant="ghost" onClick={handleContinuer}>
              Continuer
            </Button>
            {canPrompt && (
              <Button onClick={() => void handleInstall()}>
                <Download aria-hidden="true" />
                Télécharger et installer
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
