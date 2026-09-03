import { useNavigate, useParams } from "react-router-dom";
import { PersonProfileDialog } from "@/components/people/PersonProfileDialog";

/** /habitants/:id renders as a modal over whatever page linked here — closing it (X, Échap, clic
 * en dehors) revient à cette page plutôt que d'atterrir sur un fond vide. */
export default function PersonProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  return (
    <PersonProfileDialog
      personId={id}
      open
      onOpenChange={(open) => {
        if (!open) navigate(-1);
      }}
    />
  );
}
