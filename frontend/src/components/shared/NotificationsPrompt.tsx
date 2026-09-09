import { useState } from "react";
import { Bell, BellOff, BellRing, Newspaper, UsersRound, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const BENEFICES = [
  {
    icon: Newspaper,
    titre: "Les actualités du village",
    texte: "Annonces, cérémonies, projets communautaires — dès leur publication.",
  },
  {
    icon: UsersRound,
    titre: "La vie des familles",
    texte: "Naissances, unions et nouvelles fiches, sans avoir à surveiller l'application.",
  },
  {
    icon: WifiOff,
    titre: "Même application fermée",
    texte: "Les notifications arrivent sans que vous ayez à l'ouvrir.",
  },
];

/**
 * Cloche d'activation des notifications + sa modale explicative.
 *
 * Ne rend rien quand le navigateur ne sait pas recevoir de push — Firefox sur
 * iOS, ou Safari iOS tant que l'application n'a pas été ajoutée à l'écran
 * d'accueil. Un bouton qui ne peut rien faire vaut moins que pas de bouton.
 */
export function NotificationsPrompt() {
  const { supporte, permission, abonne, enCours, erreur, activer, desactiver } =
    usePushNotifications();
  const [open, setOpen] = useState(false);

  if (!supporte) return null;

  const refuse = permission === "denied";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={abonne ? "Gérer les notifications" : "Activer les notifications"}
      >
        {abonne ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {abonne ? <BellRing className="size-5" /> : <Bell className="size-5" />}
              </span>
              <DialogTitle className="text-balance">
                {abonne ? "Notifications activées" : "Restez au courant de la vie du village"}
              </DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              {abonne
                ? "Cet appareil reçoit les notifications du village. Vous pouvez les désactiver à tout moment."
                : "Recevez une notification quand quelque chose d'important se passe à Moussidalheire."}
            </DialogDescription>
          </DialogHeader>

          {!abonne && (
            <ul className="space-y-3">
              {BENEFICES.map(({ icon: Icon, titre, texte }) => (
                <li key={titre} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{titre}</p>
                    <p className="text-sm text-muted-foreground">{texte}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Permission refusée : le navigateur ne réaffichera plus jamais son
              invite. Proposer un bouton « Activer » serait mensonger — le clic
              ne produirait rien de visible. */}
          {refuse && !abonne && (
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Vous avez refusé les notifications pour ce site. Le navigateur ne le redemandera
              plus : pour les activer, autorisez-les dans ses réglages (icône à gauche de
              l'adresse du site), puis revenez ici.
            </p>
          )}

          {erreur && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {erreur}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={enCours}>
              Fermer
            </Button>

            {abonne ? (
              <Button variant="outline" onClick={() => void desactiver()} disabled={enCours}>
                <BellOff aria-hidden="true" />
                {enCours ? "Désactivation…" : "Désactiver"}
              </Button>
            ) : (
              !refuse && (
                <Button onClick={() => void activer()} disabled={enCours}>
                  <Bell aria-hidden="true" />
                  {enCours ? "Activation…" : "Activer les notifications"}
                </Button>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
