import { useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/FormField";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { changerMotDePasse } from "@/services/api/auth";

const empty = { nouveauMotDePasse: "", confirmation: "" };

const MOT_DE_PASSE_MIN = 8;

/** Mirrors the backend's `motDePasseSchema` strength rule (see
 * utilisateur.primitives.ts) so a weak new password is caught before the
 * round-trip, not just after a 400. */
function motDePasseAssezFort(valeur: string): boolean {
  return valeur.length >= MOT_DE_PASSE_MIN && /[a-zA-Z]/.test(valeur) && /[0-9]/.test(valeur);
}

/**
 * "Mot de passe" — section de la page profil (voir PersonProfileContent.tsx,
 * qui ne la rend que sur son propre profil : POST /auth/mot-de-passe agit
 * toujours sur l'utilisateur du token, jamais sur un id fourni par le
 * client — il n'existe donc aucune version "admin" de cette action).
 * Volontairement sans champ "mot de passe actuel" : le jeton d'accès seul
 * autorise le changement (voir services/api/auth.ts::changerMotDePasse pour
 * le compromis que cela implique).
 */
export function ChangePasswordSection() {
  const [form, setForm] = useState(empty);
  const { errors, setErrors, clearError, setError } = useFieldErrors();
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
    setSuccess(false);
  };

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!motDePasseAssezFort(form.nouveauMotDePasse)) {
      next.nouveauMotDePasse = "Au moins 8 caractères, avec au moins une lettre et un chiffre.";
    }
    if (form.confirmation !== form.nouveauMotDePasse) {
      next.confirmation = "La confirmation ne correspond pas au nouveau mot de passe.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    setSaving(true);
    try {
      await changerMotDePasse(form.nouveauMotDePasse);
      setForm(empty);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("nouveauMotDePasse", err.message);
      } else {
        setServerError(
          messageChampsInvalides(err) ??
            (err instanceof ApiError
              ? err.message
              : "Impossible de modifier le mot de passe pour le moment. Réessayez."),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-foreground">
        <KeyRound className="size-4" />
        Mot de passe
      </h2>

      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-4">
        <Field id="mdp-nouveau" label="Nouveau mot de passe" required error={errors.nouveauMotDePasse}>
          <Input
            id="mdp-nouveau"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={form.nouveauMotDePasse}
            onChange={(e) => set("nouveauMotDePasse", e.target.value)}
          />
        </Field>

        <Field
          id="mdp-confirmation"
          label="Confirmer le nouveau mot de passe"
          required
          error={errors.confirmation}
        >
          <Input
            id="mdp-confirmation"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={form.confirmation}
            onChange={(e) => set("confirmation", e.target.value)}
          />
        </Field>

        <button
          type="button"
          onClick={() => setShowPasswords((v) => !v)}
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {showPasswords ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPasswords ? "Masquer les mots de passe" : "Afficher les mots de passe"}
        </button>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        {success && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" />
            Mot de passe mis à jour.
          </p>
        )}

        <div className="mt-auto flex justify-end pt-2">
          <Button type="submit" disabled={saving}>
            <KeyRound />
            {saving ? "Modification…" : "Changer le mot de passe"}
          </Button>
        </div>
      </form>
    </div>
  );
}
