import { Link } from "react-router-dom";
import { GitFork, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { FamilySummary } from "@/services/api/families";
import { fullName } from "@/lib/utils";

export function FamilyCard({
  family,
  descendantCount,
}: {
  family: FamilySummary;
  /** Nombre de familles descendantes de cette lignée — calculé par la page
   * appelante à partir de la liste déjà chargée (aucun appel réseau
   * supplémentaire), affiché uniquement sur une carte de famille fondatrice. */
  descendantCount?: number;
}) {
  const ancestor = family.ancestor;

  return (
    <Link
      to={`/familles/${family.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="flex items-center gap-3 bg-gradient-to-br from-accent/10 via-secondary to-primary/10 p-5">
        {ancestor && <PersonAvatar person={ancestor} size="lg" ring />}
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={family.estFondatriceOrigine ? "default" : "secondary"}>
              {family.estFondatriceOrigine ? "Famille fondatrice" : `Génération ${family.generation}`}
            </Badge>
            {!family.estActive && <Badge variant="muted">Désactivée</Badge>}
          </div>
          <h3 className="truncate font-display text-lg font-bold text-foreground group-hover:text-primary">
            {family.name}
          </h3>
          {ancestor && (
            <p className="truncate text-xs text-muted-foreground">
              Fondée par {fullName(ancestor)}
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <p className="line-clamp-2 text-sm text-muted-foreground">{family.description}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="gap-1">
            <Users className="size-3" />
            {family.memberCount} membres
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <GitFork className="size-3" />
            {family.generationCount} générations
          </Badge>
          {descendantCount !== undefined && (
            <Badge variant="secondary" className="gap-1">
              <GitFork className="size-3" />
              {descendantCount} famille{descendantCount > 1 ? "s" : ""} descendante{descendantCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {family.locations.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-1">{family.locations.slice(0, 4).join(" · ")}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
