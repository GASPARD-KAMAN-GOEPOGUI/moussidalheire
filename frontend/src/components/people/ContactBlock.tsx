import { Lock, Mail, MessageCircle, Phone } from "lucide-react";
import { ConfidentialityBadge } from "@/components/shared/ConfidentialityBadge";
import type { Contact } from "@/types";

export function ContactBlock({ contact }: { contact?: Contact }) {
  if (!contact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <Lock className="size-4" />
        Aucune coordonnée disponible.
      </div>
    );
  }

  if (contact.visibility === "private") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          <span>Coordonnées masquées par cet habitant.</span>
        </div>
        <ConfidentialityBadge visibility={contact.visibility} />
      </div>
    );
  }

  const isMembersOnly = contact.visibility === "members";

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Coordonnées</p>
        <ConfidentialityBadge visibility={contact.visibility} />
      </div>
      {isMembersOnly && (
        <p className="text-xs text-muted-foreground">
          Visibles uniquement pour les membres connectés de la plateforme.
        </p>
      )}
      <div className="space-y-1.5 text-sm">
        {contact.phone && (
          <p className="flex items-center gap-2 text-foreground">
            <Phone className="size-3.5 text-muted-foreground" />
            {isMembersOnly ? "•• •• •• •• ••" : contact.phone}
          </p>
        )}
        {contact.whatsapp && (
          <p className="flex items-center gap-2 text-foreground">
            <MessageCircle className="size-3.5 text-muted-foreground" />
            {isMembersOnly ? "•• •• •• •• ••" : contact.whatsapp}
          </p>
        )}
        {contact.email && (
          <p className="flex items-center gap-2 text-foreground">
            <Mail className="size-3.5 text-muted-foreground" />
            {isMembersOnly ? "•••••@••••.com" : contact.email}
          </p>
        )}
      </div>
    </div>
  );
}
