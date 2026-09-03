import { useEffect, useState, type FormEvent } from "react";
import { Baby } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/FormField";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfilePhotoField } from "@/components/auth/ProfilePhotoField";
import { GeographicSituationFields } from "@/components/people/GeographicSituationFields";
import { CredentialsDialog } from "@/components/shared/CredentialsDialog";
import type { CompteAffiche } from "@/components/auth/inscription-types";
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { ajouterMonEnfant } from "@/services/api/people";
import { useFieldErrors } from "@/hooks/useFieldErrors";

const empty = {
  photo: "",
  prenom: "",
  sexe: "homme" as "homme" | "femme",
  dateNaissance: "",
  estAuVillage: true,
  estEnGuinee: true,
};

/**
 * "Ajouter mes enfants" (espace personnel) — remplace l'ancien « Ajouter un
 * habitant » de `People.tsx`. Volontairement minimal (photo, prénom, genre,
 * date de naissance) : ni nom (toujours hérité du parent connecté), ni
 * sélection de père/mère/famille — le backend détermine tout cela depuis
 * l'utilisateur authentifié (`POST /personnes/moi/enfants`), jamais depuis
 * un champ de ce formulaire. Un nouveau composant dédié plutôt qu'une
 * réutilisation de `AddMemberDialog` : son mode racine est déjà le câblage
 * réel de « Ajouter un membre » sur `FamilyDetail.tsx` (famille/père/mère
 * libres) — le réutiliser ici aurait mélangé deux comportements différents
 * dans un seul composant partagé.
 */
export function AddMyChildDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [form, setForm] = useState(empty);
  const { errors, setErrors, clearError } = useFieldErrors();
  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [pendingCompte, setPendingCompte] = useState<CompteAffiche | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(empty);
    setErrors({});
    setServerError("");
    setPendingCompte(null);
  }, [open, setErrors]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.prenom.trim()) next.prenom = "Le prénom est requis.";
    if (!form.dateNaissance) next.dateNaissance = "La date de naissance est requise.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError("");
    setSaving(true);
    try {
      const { personne, compte } = await ajouterMonEnfant({
        prenom: form.prenom.trim(),
        sexe: form.sexe,
        ...(form.photo.trim() ? { photo: form.photo.trim() } : {}),
        ...(form.dateNaissance ? { dateNaissance: form.dateNaissance } : {}),
        estAuVillage: form.estAuVillage,
        estEnGuinee: form.estEnGuinee,
      });
      setPendingCompte({
        role: "Enfant",
        nomComplet: `${personne.firstName} ${personne.lastName}`,
        ...(personne.matricule ? { matricule: personne.matricule } : {}),
        identifiant: compte.identifiant,
        motDePasseTemporaire: compte.motDePasseTemporaire,
      });
      onCreated?.();
    } catch (err) {
      setServerError(
        messageChampsInvalides(err) ?? (err instanceof ApiError ? err.message : "Impossible d'ajouter cet enfant pour le moment."),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCredentialsContinue() {
    setPendingCompte(null);
    onOpenChange(false);
  }

  if (pendingCompte) {
    return <CredentialsDialog open comptes={[pendingCompte]} onContinue={handleCredentialsContinue} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter mes enfants</DialogTitle>
          <DialogDescription>
            Le nom de famille est hérité automatiquement du vôtre vous n'avez rien d'autre à renseigner.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <ProfilePhotoField value={form.photo} onChange={(url) => set("photo", url)} prenom={form.prenom} />

          <Field id="enfant-prenom" label="Prénom" required error={errors.prenom}>
            <Input id="enfant-prenom" value={form.prenom} onChange={(e) => set("prenom", e.target.value)} />
          </Field>

          <Field id="enfant-sexe" label="Genre" required>
            <Select value={form.sexe} onValueChange={(v) => set("sexe", v as "homme" | "femme")}>
              <SelectTrigger id="enfant-sexe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homme">Homme</SelectItem>
                <SelectItem value="femme">Femme</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field id="enfant-dateNaissance" label="Date de naissance" required error={errors.dateNaissance}>
            <Input
              id="enfant-dateNaissance"
              type="date"
              value={form.dateNaissance}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set("dateNaissance", e.target.value)}
            />
          </Field>

          <GeographicSituationFields
            idPrefix="enfant"
            estDecede={false}
            estAuVillage={form.estAuVillage}
            estEnGuinee={form.estEnGuinee}
            onChange={(next) => setForm((f) => ({ ...f, estAuVillage: next.estAuVillage, estEnGuinee: next.estEnGuinee }))}
          />

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              <Baby />
              {saving ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
