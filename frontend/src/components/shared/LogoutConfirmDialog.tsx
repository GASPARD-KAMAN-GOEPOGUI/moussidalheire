import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LogoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Avertissement affiché avant une déconnexion hors ligne (voir useLogoutFlow).
 *
 * À monter en dehors du DropdownMenu / Sheet qui porte le bouton : ces
 * conteneurs se ferment au clic, et une modale rendue à l'intérieur serait
 * démontée avant d'avoir pu s'afficher.
 */
export function LogoutConfirmDialog({ open, onOpenChange, onConfirm }: LogoutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <WifiOff className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle className="text-balance">Se déconnecter hors connexion ?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Vous êtes actuellement hors connexion. Si vous vous déconnectez maintenant, les données
            consultables hors-ligne seront effacées et vous ne pourrez pas vous reconnecter tant que
            vous n'aurez pas retrouvé une connexion internet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Se déconnecter quand même
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
