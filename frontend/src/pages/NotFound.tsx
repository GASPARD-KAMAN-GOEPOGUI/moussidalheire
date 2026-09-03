import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        description="Cette page n'existe pas ou a été déplacée."
        action={
          <Button asChild>
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        }
      />
    </div>
  );
}
