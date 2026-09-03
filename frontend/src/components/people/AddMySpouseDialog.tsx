import { useEffect, useState, type FormEvent } from "react";
import { Heart } from "lucide-react";
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
import { ProfilePhotoField } from "@/components/auth/ProfilePhotoField";
import { CredentialsDialog } from "@/components/shared/CredentialsDialog";
import { PhoneInput } from "@/components/shared/PhoneInput";
import type { CompteAffiche } from "@/components/auth/inscription-types";
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { versMajusculesSansAccent } from "@/lib/utils";
import { ajouterMonConjoint } from "@/services/api/people";
import { useFieldErrors } from "@/hooks/useFieldErrors";

const empty = {
  photo: "",
  prenom: "",
  nom: "",
  telephone: "",
};

/**
 * "Ajouter mon/ma conjoint·e" (espace personnel, carte "Conjoint·e" de
 * `Families.tsx`) — volontairement minimal (photo, prénom, nom, téléphone) :
 * ni sexe (toujours déduit côté backend comme l'opposé de l'utilisateur
 * connecté), ni statut/famille — le backend crée la personne, son compte, et
 * l'union (`POST /personnes/moi/conjoint`) en un seul appel.
 */
export function AddMySpouseDialog({
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
    if (!form.nom.trim()) next.nom = "Le nom est requis.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setServerError("");
    setSaving(true);
    try {
      const { personne, compte } = await ajouterMonConjoint({
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        ...(form.photo.trim() ? { photo: form.photo.trim() } : {}),
        ...(form.telephone.trim() ? { telephone: form.telephone.trim() } : {}),
      });
      setPendingCompte({
        role: "Conjoint·e",
        nomComplet: `${personne.firstName} ${personne.lastName}`,
        ...(personne.matricule ? { matricule: personne.matricule } : {}),
        identifiant: compte.identifiant,
        motDePasseTemporaire: compte.motDePasseTemporaire,
      });
      onCreated?.();
    } catch (err) {
      setServerError(
        messageChampsInvalides(err) ??
          (err instanceof ApiError ? err.message : "Impossible d'ajouter ce/cette conjoint·e pour le moment."),
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
          <DialogTitle>Ajouter mon/ma conjoint·e</DialogTitle>
          <DialogDescription>
            Un compte de connexion sera créé automatiquement pour votre conjoint·e.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <ProfilePhotoField value={form.photo} onChange={(url) => set("photo", url)} prenom={form.prenom} nom={form.nom} />

          <Field id="conjoint-prenom" label="Prénom" required error={errors.prenom}>
            <Input id="conjoint-prenom" value={form.prenom} onChange={(e) => set("prenom", e.target.value)} />
          </Field>

          <Field id="conjoint-nom" label="Nom" required error={errors.nom}>
            <Input
              id="conjoint-nom"
              value={form.nom}
              onChange={(e) => set("nom", versMajusculesSansAccent(e.target.value))}
            />
          </Field>

          <Field id="conjoint-telephone" label="Numéro de téléphone">
            <PhoneInput
              id="conjoint-telephone"
              value={form.telephone}
              onValueChange={(v) => set("telephone", v)}
            />
          </Field>

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
              <Heart />
              {saving ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
