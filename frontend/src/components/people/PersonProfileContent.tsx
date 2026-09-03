import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Cake,
  IdCard,
  MapPin,
  Pencil,
  Power,
  PowerOff,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { ChangePasswordSection } from "@/components/people/ChangePasswordSection";
import { ContactBlock } from "@/components/people/ContactBlock";
import { ConfidentialityBadge } from "@/components/shared/ConfidentialityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAsync } from "@/hooks/useAsync";
import { getPerson, togglePersonActive } from "@/services/api/people";
import { ApiError } from "@/lib/api-client";
import { cn, fullName } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * Full "Personne" profile — identity card, edit & deactivate actions. Shared
 * by the /habitants/:id page and the quick-open profile modal. On one's own
 * profile only (`isOwnProfile`), the identity card widens into a two-column
 * layout and gains a second column for `ChangePasswordSection` — never shown
 * on anyone else's profile, admin view included, since
 * `POST /auth/mot-de-passe` only ever acts on the connected utilisateur.
 */
export function PersonProfileContent({ id }: { id: string }) {
  const { key } = useLocation();
  const { data: person, loading, refetch } = useAsync(() => getPerson(id), [id, key]);
  const isAdmin = useAuthStore((s) => s.utilisateur?.role === "admin");
  const personneUuid = useAuthStore((s) => s.utilisateur?.personneUuid);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");

  if (loading) {
    return (
      <div className="mx-auto max-w-sm">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!person) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Habitant introuvable"
        description="Ce profil n'existe pas ou a été retiré du recensement."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/habitants">Retour à l'annuaire</Link>
          </Button>
        }
      />
    );
  }

  const currentResidence = person.residenceHistory.find((r) => r.current);
  const isOwnProfile = !!personneUuid && personneUuid === person.id;

  async function handleToggleActive() {
    setToggling(true);
    setToggleError("");
    try {
      await togglePersonActive(person!.id, !person!.isActive);
      setConfirmOpen(false);
      refetch();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setToggling(false);
    }
  }

  const identity = (
    <div className="flex flex-col items-center gap-3 text-center">
      <PersonAvatar person={person} size="xl" ring />
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{fullName(person)}</h1>
        {person.nickname && <p className="text-sm italic text-muted-foreground">« {person.nickname} »</p>}
      </div>

      <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">
        <IdCard className="size-3.5" />
        {person.matricule}
      </span>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {person.isDeceased ? (
          <Badge variant="muted">In memoriam{person.birthYear ? ` (${person.birthYear})` : ""}</Badge>
        ) : (
          <Badge variant="success">Vivant·e</Badge>
        )}
      </div>

      {person.roleInVillage && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <ShieldCheck className="size-4" />
          {person.roleInVillage}
        </p>
      )}

      <div className="w-full space-y-2 border-t border-border pt-4 text-left text-sm">
        {(person.birthDate || person.birthYear) && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Cake className="size-4 shrink-0" />
            {person.birthDate
              ? `Né·e le ${new Date(person.birthDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
              : `Né·e en ${person.birthYear}`}
            {person.birthPlace ? ` à ${person.birthPlace}` : ""}
          </p>
        )}
        {currentResidence && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            Vit à {currentResidence.location.city}, {currentResidence.location.country}
          </p>
        )}
      </div>

      <div className="w-full pt-2">
        <ContactBlock contact={person.contact} />
      </div>

      <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>Visibilité du profil</span>
        <ConfidentialityBadge visibility={person.visibility} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {!person.isActive && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          Ce profil est désactivé il n'apparaît plus dans l'annuaire ni les résultats de recherche.
        </div>
      )}

      <div className={cn("mx-auto", isOwnProfile ? "max-w-4xl" : "max-w-sm")}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
              {person.canEdit && (
                <Button asChild variant="outline" size="sm">
                  <Link to={`/habitants/${person.id}/modifier`}>
                    <Pencil />
                    Modifier
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className={person.isActive ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}
                  onClick={() => setConfirmOpen(true)}
                >
                  {person.isActive ? <PowerOff /> : <Power />}
                  {person.isActive ? "Désactiver" : "Réactiver"}
                </Button>
              )}
              <DialogClose asChild>
                <Button variant="outline" size="icon-sm">
                  <X />
                  <span className="sr-only">Fermer</span>
                </Button>
              </DialogClose>
            </div>

            {isOwnProfile ? (
              <div className="grid gap-6 pt-2 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-8">
                <div>{identity}</div>
                <div className="hidden bg-border md:block" />
                <div className="border-t border-border pt-6 md:border-t-0 md:pt-0">
                  <ChangePasswordSection />
                </div>
              </div>
            ) : (
              <div className="pt-2">{identity}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{person.isActive ? "Désactiver ce profil ?" : "Réactiver ce profil ?"}</DialogTitle>
            <DialogDescription>
              {person.isActive
                ? `${fullName(person)} ne sera plus visible dans l'annuaire ni dans les résultats de recherche. Ses liens de parenté et sa place dans l'arbre généalogique seront conservés.`
                : `${fullName(person)} redeviendra visible dans l'annuaire et les résultats de recherche.`}
            </DialogDescription>
          </DialogHeader>
          {toggleError && (
            <p role="alert" className="text-sm text-destructive">
              {toggleError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant={person.isActive ? "destructive" : "default"}
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {person.isActive ? <PowerOff /> : <Power />}
              {toggling ? "Veuillez patienter…" : person.isActive ? "Désactiver" : "Réactiver"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
