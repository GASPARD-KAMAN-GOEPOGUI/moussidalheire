import { useNavigate, useParams } from "react-router-dom";
import { NewsDetailDialog } from "@/components/news/NewsDetailDialog";

/** /actualites/:id renders as a modal over whatever page linked here — closing it (X, Échap, clic
 * en dehors) revient à cette page plutôt que d'atterrir sur un fond vide. */
export default function NewsDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  return (
    <NewsDetailDialog
      id={id}
      open
      onOpenChange={(open) => {
        if (!open) navigate(-1);
      }}
    />
  );
}
