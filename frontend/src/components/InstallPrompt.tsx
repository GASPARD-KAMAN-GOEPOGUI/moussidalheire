import { useState } from "react";
import { Download, Plus, Share, Smartphone, WifiOff, Zap } from "lucide-react";
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

/**
 * Bouton d'installation de la PWA + sa modale explicative.
 *
 * Ne rend rien tant que l'installation n'a pas de sens : app déjà installée,
 * ou navigateur qui ne propose aucun chemin d'installation (Firefox desktop,
 * par exemple).
 */
export function InstallPrompt() {
  const { canInstall, canPrompt, isIOS, promptInstall } = useInstallPrompt();
  const [open, setOpen] = useState(false);

  if (!canInstall) return null;

  async function handleInstall() {
    await promptInstall();
    // On ferme quel que soit le choix : accepté, la modale n'a plus d'objet ;
    // refusé, insister serait pénible.
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
          {!canPrompt && isIOS && (
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
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
