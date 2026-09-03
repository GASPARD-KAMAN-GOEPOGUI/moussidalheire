import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PersonProfileContent } from "./PersonProfileContent";

/** Opens a person's full profile (identity, edit & deactivate actions) in a modal instead of navigating to /habitants/:id. */
export function PersonProfileDialog({
  personId,
  open,
  onOpenChange,
}: {
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none" hideClose>
        <DialogTitle className="sr-only">Profil de l'habitant</DialogTitle>
        <DialogDescription className="sr-only">Profil détaillé de l'habitant.</DialogDescription>
        {open && <PersonProfileContent id={personId} />}
      </DialogContent>
    </Dialog>
  );
}
