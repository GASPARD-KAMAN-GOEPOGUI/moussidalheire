import { useState } from "react";
import { Baby, Heart, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { RelationLink } from "@/components/people/RelationLink";
import { AddMyChildDialog } from "@/components/people/AddMyChildDialog";
import { AddMySpouseDialog } from "@/components/people/AddMySpouseDialog";
import { useAsync } from "@/hooks/useAsync";
import { getPerson, getPersonRelations } from "@/services/api/people";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Plus de lignées/générations de familles ici — cette page montre uniquement
 * la famille nucléaire du membre connecté (son père, sa mère, lui/elle-même,
 * son/sa/ses conjoint·e·s, ses enfants), dérivée de ses propres relations
 * (`getPersonRelations`) plutôt que du modèle "Famille" (fondatrice/
 * descendante) — ce dernier reste inchangé ailleurs dans l'app (inscription,
 * page de détail d'une famille, etc.), seul le contenu de cette page change.
 */
export default function Families() {
  const personneUuid = useAuthStore((s) => s.utilisateur?.personneUuid);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [addSpouseOpen, setAddSpouseOpen] = useState(false);

  const { data, loading, error, refetch } = useAsync(async () => {
    if (!personneUuid) return undefined;
    const [moi, relations] = await Promise.all([getPerson(personneUuid), getPersonRelations(personneUuid)]);
    return moi && relations ? { moi, relations } : undefined;
  }, [personneUuid]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vous"
        title="Votre famille"
        description="Votre père, votre mère, vous-même, votre conjoint·e et vos enfants."
        actions={
          <Button size="sm" onClick={() => setAddChildOpen(true)}>
            <Baby />
            Ajouter mes enfants
          </Button>
        }
      />

      <AddMyChildDialog open={addChildOpen} onOpenChange={setAddChildOpen} onCreated={refetch} />
      <AddMySpouseDialog open={addSpouseOpen} onOpenChange={setAddSpouseOpen} onCreated={refetch} />

      {loading || !personneUuid ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : error ? (
        <DataErrorState error={error} onRetry={refetch} />
      ) : !data ? (
        // Distinct de l'erreur : la requête a abouti, c'est la fiche liée au
        // compte qui est introuvable.
        <EmptyState
          icon={UsersRound}
          title="Fiche personnelle introuvable"
          description="Impossible de retrouver votre propre fiche pour afficher votre famille."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="size-4 text-primary" />
                {data.relations.spouses.length > 1 ? "Vous & conjoint·e·s" : "Vous & conjoint·e"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <RelationLink person={data.moi} role="Vous" />
              {data.relations.spouses.length > 0 ? (
                data.relations.spouses.map((s) => <RelationLink key={s.id} person={s} role="Conjoint·e" />)
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => setAddSpouseOpen(true)}
                >
                  <Heart />
                  Ajouter mon/ma conjoint·e
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parents</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.relations.father ? (
                <RelationLink person={data.relations.father} role="Père" />
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Père non renseigné
                </p>
              )}
              {data.relations.mother ? (
                <RelationLink person={data.relations.mother} role="Mère" />
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Mère non renseignée
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Enfants{data.relations.children.length > 0 ? ` (${data.relations.children.length})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.relations.children.length > 0 ? (
                data.relations.children.map((c) => <RelationLink key={c.id} person={c} />)
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Aucun enfant renseigné
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
