import { useState } from "react";
import { Briefcase, MapPin } from "lucide-react";
import { PersonAvatar } from "./PersonAvatar";
import { PersonProfileDialog } from "./PersonProfileDialog";
import { Badge } from "@/components/ui/badge";
import { getFamilyByIdSync } from "@/services/api/families";
import { fullName } from "@/lib/utils";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

interface PersonCardProps {
  person: Person;
  variant?: "grid" | "list";
}

export function PersonCard({ person, variant = "grid" }: PersonCardProps) {
  const family = getFamilyByIdSync(person.familyId);
  const currentResidence = person.residenceHistory.find((r) => r.current);
  const [profileOpen, setProfileOpen] = useState(false);

  if (variant === "list") {
    return (
      <>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className={cn(
            "group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
            !person.isActive && "opacity-70",
          )}
        >
          <PersonAvatar person={person} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display font-semibold text-foreground group-hover:text-primary">
                {fullName(person)}
              </h3>
              {person.isDeceased && (
                <Badge variant="muted" className="shrink-0">
                  In memoriam
                </Badge>
              )}
              {!person.isActive && (
                <Badge variant="destructive" className="shrink-0">
                  Désactivé
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">{family?.name}</p>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
            {currentResidence && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {currentResidence.location.city}
              </span>
            )}
            {person.profession && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="size-3" />
                {person.profession}
              </span>
            )}
          </div>
        </button>
        <PersonProfileDialog personId={person.id} open={profileOpen} onOpenChange={setProfileOpen} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setProfileOpen(true)}
        className={cn(
          "group relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg",
          !person.isActive && "opacity-70",
        )}
      >
        <div
          className={cn(
            "relative flex h-28 items-end justify-center bg-gradient-to-br from-primary/15 via-secondary to-accent/10 pt-6",
          )}
        >
          <PersonAvatar person={person} size="lg" ring className="translate-y-9" />
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 px-4 pb-5 pt-11 text-center">
          <h3 className="truncate font-display text-base font-semibold text-foreground group-hover:text-primary">
            {fullName(person)}
          </h3>
          {person.nickname && <p className="text-xs italic text-muted-foreground">« {person.nickname} »</p>}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {!person.isActive && <Badge variant="destructive">Désactivé</Badge>}
            {!person.isDeceased && currentResidence && (
              <Badge variant="outline" className="gap-1">
                <MapPin className="size-3" />
                {currentResidence.location.city}
              </Badge>
            )}
          </div>

          {person.profession && !person.isDeceased && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="size-3" />
              {person.profession}
            </p>
          )}
        </div>
      </button>
      <PersonProfileDialog personId={person.id} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
