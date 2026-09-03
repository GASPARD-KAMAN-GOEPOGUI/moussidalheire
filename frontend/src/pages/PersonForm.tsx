import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/shared/FormField";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfilePhotoField } from "@/components/auth/ProfilePhotoField";
import { LocationPicker } from "@/components/people/LocationPicker";
import { GeographicSituationFields } from "@/components/people/GeographicSituationFields";
import { useAsync } from "@/hooks/useAsync";
import {
  definirResidenceActuelle,
  getPerson,
  getPersonRelations,
  patchPersonneReelle,
  resolvePersonneNumericId,
  resolvePersonRef,
  type PersonneReelleInput,
} from "@/services/api/people";
import { resolveFamilleNumericId } from "@/services/api/families";
import { resolveLieuNumericId } from "@/services/api/lieux";
import { toVisibiliteApi } from "@/services/api/mappers";
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { nettoyerSaisieTelephone, versMajusculesSansAccent } from "@/lib/utils";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import type { PersonRef } from "@/components/auth/inscription-types";
import type { Gender, Location, Person, PersonInput } from "@/types";

function toGenderApi(g: Gender): "homme" | "femme" {
  return g === "male" ? "homme" : "femme";
}

function personToInputReal(p: Person): PersonInput {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    ...(p.nickname ? { nickname: p.nickname } : {}),
    gender: p.gender,
    ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate } : {}),
    ...(p.birthPlace ? { birthPlace: p.birthPlace } : {}),
    isDeceased: p.isDeceased,
    ...(p.maritalStatus ? { maritalStatus: p.maritalStatus } : {}),
    isInVillage: p.isInVillage,
    isInGuinea: p.isInGuinea,
    familyId: p.familyId,
    generation: p.generation,
    ...(p.branch ? { branch: p.branch } : {}),
    ...(p.profession ? { profession: p.profession } : {}),
    ...(p.educationLevel ? { educationLevel: p.educationLevel } : {}),
    ...(p.bio ? { bio: p.bio } : {}),
    ...(p.roleInVillage ? { roleInVillage: p.roleInVillage } : {}),
    // Nettoyé dès le chargement, pas seulement à la frappe : une fiche
    // ancienne peut porter un numéro saisi avant cette règle ("620 00 00 00"),
    // que le validator backend refuse désormais — sans ça, enregistrer la
    // moindre modification d'une telle fiche échouerait sur un champ auquel
    // l'utilisateur n'a pas touché.
    ...(p.contact?.phone ? { contactPhone: nettoyerSaisieTelephone(p.contact.phone) } : {}),
    ...(p.contact?.email ? { contactEmail: p.contact.email } : {}),
    ...(p.contact?.whatsapp ? { contactWhatsapp: p.contact.whatsapp } : {}),
    contactVisibility: p.contact?.visibility ?? "members",
    visibility: p.visibility,
  };
}

/** A related `Person` (père/mère/conjoint·e, already real) turned into the
 * `PersonRef` shape `PersonPicker`/`PersonRefListField` expect — resolving
 * its numeric id (needed for any FK write) alongside the uuid already on
 * hand. */
async function personToRef(p: Person, sexeOverride?: "homme" | "femme"): Promise<PersonRef> {
  const id = await resolvePersonneNumericId(p.id);
  return {
    mode: "existant",
    id,
    uuid: p.id,
    prenom: p.firstName,
    nom: p.lastName,
    matricule: p.matricule,
    sexe: sexeOverride ?? toGenderApi(p.gender),
  };
}

/**
 * `/habitants/:id/modifier` — the only mode this page still serves. The
 * former `/habitants/nouveau` self-registration mode (`RegistrationForm`) was
 * removed: it was a fully mock, unpersisted duplicate of the real "Nouveau
 * membre" flow already live on the login screen (`NewMemberDialog`), and no
 * visible button anywhere pointed to it.
 */
export default function PersonForm() {
  return <EditForm />;
}

function EditForm() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const { data: person, loading: personLoading } = useAsync(() => getPerson(id), [id]);
  const { data: relations, loading: relationsLoading } = useAsync(() => getPersonRelations(id), [id]);

  const [form, setForm] = useState<PersonInput | null>(null);
  const [pereRef, setPereRef] = useState<PersonRef | null>(null);
  const [mereRef, setMereRef] = useState<PersonRef | null>(null);
  const [residence, setResidence] = useState<Location | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const { errors, setErrors, clearError } = useFieldErrors();
  const [submitError, setSubmitError] = useState("");

  // Populates the editable state from the real fiche exactly once it (and its
  // relations) have loaded — re-populating on every render would clobber
  // in-progress edits.
  useEffect(() => {
    if (!person || !relations || initialized) return;
    setInitialized(true);
    setForm(personToInputReal(person));
    setResidence(person.residenceHistory.find((r) => r.current)?.location ?? null);
    void (async () => {
      const [pere, mere] = await Promise.all([
        relations.father ? personToRef(relations.father, "homme") : Promise.resolve(null),
        relations.mother ? personToRef(relations.mother, "femme") : Promise.resolve(null),
      ]);
      setPereRef(pere);
      setMereRef(mere);
    })();
  }, [person, relations, initialized]);

  const set = <K extends keyof PersonInput>(key: K, value: PersonInput[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    clearError(key as string);
  };

  const setGeo = (next: { estAuVillage: boolean; estEnGuinee: boolean }) =>
    setForm((f) => (f ? { ...f, isInVillage: next.estAuVillage, isInGuinea: next.estEnGuinee } : f));

  if (personLoading || relationsLoading || !form) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!person) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Habitant introuvable"
        description="Impossible de modifier un profil qui n'existe pas ou a été retiré."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate("/habitants")}>
            Retour à l'annuaire
          </Button>
        }
      />
    );
  }

  function validate(): boolean {
    if (!form) return false;
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = "Le prénom est requis.";
    if (!form.lastName.trim()) next.lastName = "Le nom est requis.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError("");
    if (!validate() || !form) return;
    setSaving(true);
    try {
      const familleId = await resolveFamilleNumericId(form.familyId);
      if (familleId === undefined) throw new ApiError(404, "Famille introuvable.");

      const [pereResolved, mereResolved] = await Promise.all([
        pereRef ? resolvePersonRef(pereRef, familleId) : Promise.resolve(undefined),
        mereRef ? resolvePersonRef(mereRef, familleId) : Promise.resolve(undefined),
      ]);

      const patch: Partial<PersonneReelleInput> = {
        prenom: form.firstName.trim(),
        nom: form.lastName.trim(),
        sexe: toGenderApi(form.gender),
        familleId,
        ...(form.nickname?.trim() ? { surnom: form.nickname.trim() } : {}),
        ...(form.photoUrl?.trim() ? { photo: form.photoUrl.trim() } : {}),
        ...(form.birthDate ? { dateNaissance: form.birthDate } : {}),
        ...(form.birthPlace?.trim() ? { lieuNaissance: form.birthPlace.trim() } : {}),
        estDecede: form.isDeceased,
        estAuVillage: form.isInVillage,
        estEnGuinee: form.isInGuinea,
        ...(form.maritalStatus ? { statutMatrimonial: form.maritalStatus } : {}),
        ...(form.profession?.trim() ? { profession: form.profession.trim() } : {}),
        ...(form.educationLevel ? { niveauEtudes: form.educationLevel } : {}),
        ...(form.bio?.trim() ? { bio: form.bio.trim() } : {}),
        ...(form.contactPhone?.trim() ? { telephone: form.contactPhone.trim() } : {}),
        ...(form.contactEmail?.trim() ? { email: form.contactEmail.trim() } : {}),
        ...(form.contactWhatsapp?.trim() ? { whatsapp: form.contactWhatsapp.trim() } : {}),
        visibiliteContacts: toVisibiliteApi(form.contactVisibility),
        visibiliteProfil: toVisibiliteApi(form.visibility),
        pereId: pereResolved?.id,
        mereId: mereResolved?.id,
      };
      const updated = await patchPersonneReelle(id, patch);

      if (residence) {
        const lieuId = await resolveLieuNumericId(residence.id);
        if (lieuId !== undefined) await definirResidenceActuelle(id, lieuId);
      }

      navigate(`/habitants/${updated.id}`);
    } catch (err) {
      setSubmitError(
        messageChampsInvalides(err) ??
          (err instanceof ApiError ? err.message : "Une erreur est survenue lors de l'enregistrement."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft />
        Retour
      </Button>

      <PageHeader
        eyebrow="Modification"
        title={`Modifier ${form.firstName} ${form.lastName}`.trim()}
        description="Mettez à jour les informations de ce profil."
        actions={
          <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">
            {person.matricule}
          </span>
        }
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ProfilePhotoField
                  value={form.photoUrl ?? ""}
                  onChange={(url) => set("photoUrl", url)}
                  prenom={form.firstName}
                  nom={form.lastName}
                />
              </div>
              <Field id="firstName" label="Prénom" required error={errors.firstName}>
                <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
              </Field>
              <Field id="lastName" label="Nom" required error={errors.lastName}>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => set("lastName", versMajusculesSansAccent(e.target.value))}
                />
              </Field>
              <Field id="gender" label="Sexe" required>
                <Select value={form.gender} onValueChange={(v) => set("gender", v as PersonInput["gender"])}>
                  <SelectTrigger id="gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Homme</SelectItem>
                    <SelectItem value="female">Femme</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="birthDate" label="Date de naissance">
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate ?? (form.birthYear ? `${form.birthYear}-01-01` : "")}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => set("birthDate", e.target.value)}
                />
              </Field>
              <Field id="birthPlace" label="Lieu de naissance" className="sm:col-span-2">
                <Input id="birthPlace" value={form.birthPlace ?? ""} onChange={(e) => set("birthPlace", e.target.value)} />
              </Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="isDeceased"
                  checked={form.isDeceased}
                  onCheckedChange={(c) => set("isDeceased", c === true)}
                />
                <Label htmlFor="isDeceased" className="font-normal">
                  Cette personne est décédée
                </Label>
              </div>
              <GeographicSituationFields
                idPrefix="person"
                estDecede={form.isDeceased}
                estAuVillage={form.isInVillage}
                estEnGuinee={form.isInGuinea}
                onChange={setGeo}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Informations complémentaires
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="profession" label="Profession">
                  <Input id="profession" value={form.profession ?? ""} onChange={(e) => set("profession", e.target.value)} />
                </Field>
                <Field id="residence" label="Résidence actuelle">
                  <LocationPicker value={residence} onChange={setResidence} />
                </Field>
                <Field id="bio" label="Biographie courte" className="sm:col-span-2">
                  <textarea
                    id="bio"
                    value={form.bio ?? ""}
                    onChange={(e) => set("bio", e.target.value)}
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Coordonnées & confidentialité
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="contactPhone" label="Téléphone">
                  <PhoneInput id="contactPhone" value={form.contactPhone ?? ""} onValueChange={(v) => set("contactPhone", v)} />
                </Field>
                <Field id="contactEmail" label="E-mail">
                  <Input
                    id="contactEmail"
                    type="email"
                    value={form.contactEmail ?? ""}
                    onChange={(e) => set("contactEmail", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 pb-10 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            <Save />
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>
    </div>
  );
}
