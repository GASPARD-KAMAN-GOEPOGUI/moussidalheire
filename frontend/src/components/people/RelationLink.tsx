import { Link } from "react-router-dom";
import { PersonAvatar } from "./PersonAvatar";
import { fullName } from "@/lib/utils";
import type { Person } from "@/types";

interface RelationLinkProps {
  person: Person;
  role?: string;
}

export function RelationLink({ person, role }: RelationLinkProps) {
  return (
    <Link
      to={`/habitants/${person.id}`}
      className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 pr-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <PersonAvatar person={person} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{fullName(person)}</p>
        {role && <p className="truncate text-xs text-muted-foreground">{role}</p>}
      </div>
    </Link>
  );
}
