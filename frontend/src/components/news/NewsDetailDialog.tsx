import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NewsDetailContent } from "./NewsDetailContent";

/** Opens an actualité's full detail (image, content, edit & deactivate
 * actions) in a modal instead of navigating to /actualites/:id. */
export function NewsDetailDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="sr-only">Détail de l'actualité</DialogTitle>
        <DialogDescription className="sr-only">Actualité détaillée.</DialogDescription>
        {open && <NewsDetailContent id={id} />}
      </DialogContent>
    </Dialog>
  );
}
