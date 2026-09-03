import { AlertTriangle, Check, Copy, UserPlus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field } from "@/components/shared/FormField";
import { PersonPicker } from "@/components/auth/PersonPicker";
import { GeographicSituationFields } from "@/components/people/GeographicSituationFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getFamilyByIdSync, listFamilies, resolveFamilleNumericId, type FamilySummary } from "@/services/api/families";
import {
  creerPersonneReelle,
  creerUnionReelle,
  estUnionEntre,
  getPerson,
  getPersonRelations,
  patchPersonneReelle,
  resolvePersonneNumericId,
  resolvePersonRef,
  type PersonneReelleInput,
  type StatutUnionApi,
} from "@/services/api/people";
import { apiRequest, ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { focusFirstError } from "@/lib/focus-first-error";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { MARITAL_STATUS_LABELS } from "@/data/mock/pools";
import { fullName, versMajusculesSansAccent, EMAIL_RE, PHONE_RE } from "@/lib/utils";
import { PhoneInput } from "@/components/shared/PhoneInput";
import type { Gender, MaritalStatus, Person } from "@/types";
import type { PersonRef } from "@/components/auth/inscription-types";

/** Frontend-only — steers this one form, never stored on Person/PersonInput. "Autre relation" isn't offered: nothing in the data model backs an unstructured relation type yet. */
export type RelationMode = "parent" | "child" | "spouse" | "sibling";

const emptyIdentity = {
  photoUrl: "",
  firstName: "",
  lastName: "",
  gender: "male" as Gender,
  birthDate: "",
  birthPlace: "",
  phone: "",
  email: "",
  profession: "",
  bio: "",
  isDeceased: false,
  maritalStatus: "" as MaritalStatus | "",
  estAuVillage: true,
  estEnGuinee: true,
};

const RELATION_LABELS: Record<RelationMode, string> = {
  parent: "Parent (père ou mère)",
  child: "Enfant",
  spouse: "Conjoint·e",
  sibling: "Frère/Sœur",
};

function toGenderApi(g: Gender): "homme" | "femme" {
  return g === "male" ? "homme" : "femme";
}

/**
 * The one "add member" form for the whole census — a root ancestor, or someone rattaché·e à
 * une personne existante par n'importe quelle relation (parent/enfant/conjoint·e/frère-sœur).
 * Écrit dans le vrai backend (`POST/PUT /personnes`, `POST /unions`) — crée uniquement des
 * `Personne`, jamais de compte `Utilisateur` (contrairement à `NewMemberDialog`, réservé à
 * l'auto-inscription). Génération et matricule sont toujours calculés côté serveur.
 */
export function AddMemberDialog({
  open,
  onOpenChange,
  onCreated,
  mode,
  referencePersonId,
  initialFamilyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Locks the relation (opened from a person's "+ Ajouter" menu) — the in-form famille/père/mère picker is skipped. */
  mode?: RelationMode;
  referencePersonId?: string;
  /** Pre-selects a family for a new member, when opened from that family's own page. */
  initialFamilyId?: string;
}) {
  const navigate = useNavigate();

  // Current relation context — seeded from props, but can be replaced in place by "continuer" actions on the success screen (e.g. add another child) without closing the dialog.
  const [ctxMode, setCtxMode] = useState<RelationMode | undefined>(mode);
  const [ctxReferenceId, setCtxReferenceId] = useState<string | undefined>(referencePersonId);

  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [familyId, setFamilyId] = useState(initialFamilyId ?? "");
  const [pereRef, setPereRef] = useState<PersonRef | null>(null);
  const [mereRef, setMereRef] = useState<PersonRef | null>(null);

  // Reference person (relation-locked entry) — loaded from the real API.
  const [referencePerson, setReferencePerson] = useState<Person | null>(null);
  const [referenceRelations, setReferenceRelations] = useState<Awaited<ReturnType<typeof getPersonRelations>> | null>(null);
  const [referenceNumericId, setReferenceNumericId] = useState<number | null>(null);
  const [referenceParentIds, setReferenceParentIds] = useState<{ pereId?: number; mereId?: number }>({});

  const [parentType, setParentType] = useState<"father" | "mother">("father");
  const [targetChoice, setTargetChoice] = useState<"new" | "existing">("new");
  const [targetRef, setTargetRef] = useState<PersonRef | null>(null);
  const [otherParentRef, setOtherParentRef] = useState<PersonRef | null>(null);

  const [identity, setIdentity] = useState(emptyIdentity);
  const [spouseRefs, setSpouseRefs] = useState<PersonRef[]>([]);
  const [lastNameTouched, setLastNameTouched] = useState(false);
  const { errors, setErrors, clearError } = useFieldErrors();
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Person | null>(null);
  const [copied, setCopied] = useState(false);
  const [duplicates, setDuplicates] = useState<{ id: string; prenom: string; nom: string }[]>([]);
  const [forcerCreation, setForcerCreation] = useState(false);

  const locked = !!(mode && referencePersonId); // opened contextually — skip the famille/père/mère picker
  const effectiveMode: RelationMode | undefined = ctxMode;
  const effectiveReferenceId = ctxReferenceId ?? "";
  const isRootPath = !effectiveMode || !effectiveReferenceId;

  const set = <K extends keyof typeof emptyIdentity>(key: K, value: (typeof emptyIdentity)[K]) => {
    setIdentity((f) => ({ ...f, [key]: value }));
    clearError(key as string);
  };

  function seedFresh(nextMode: RelationMode | undefined, nextReferenceId: string | undefined, nextFamilyId?: string) {
    setCtxMode(nextMode);
    setCtxReferenceId(nextReferenceId);
    setFamilyId(nextFamilyId ?? "");
    setPereRef(null);
    setMereRef(null);
    setReferencePerson(null);
    setReferenceRelations(null);
    setReferenceNumericId(null);
    setReferenceParentIds({});
    setParentType("father");
    setTargetChoice("new");
    setTargetRef(null);
    setOtherParentRef(null);
    setIdentity(emptyIdentity);
    setSpouseRefs([]);
    setLastNameTouched(false);
    setErrors({});
    setServerError("");
    setDuplicates([]);
    setForcerCreation(false);
  }

  // Opening the dialog (fresh, or with a different context) re-seeds everything from props.
  useEffect(() => {
    if (!open) return;
    seedFresh(mode, referencePersonId, initialFamilyId);
    setCreated(null);
    setFamiliesLoading(true);
    listFamilies()
      .then(setFamilies)
      .catch(() => setFamilies([]))
      .finally(() => setFamiliesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, referencePersonId, initialFamilyId]);

  // A newly created parent's gender follows which slot (père/mère) is being filled.
  useEffect(() => {
    if (effectiveMode === "parent") set("gender", parentType === "father" ? "male" : "female");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentType, effectiveMode]);

  // Last name follows the reference person, until the operator edits it themselves.
  useEffect(() => {
    if (lastNameTouched || !referencePerson) return;
    if (effectiveMode === "child" || effectiveMode === "sibling") set("lastName", referencePerson.lastName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencePerson, effectiveMode]);

  // Load the reference person (display + relations + raw numeric/parent ids) from the real API.
  useEffect(() => {
    if (!open || !effectiveReferenceId) return;
    let cancelled = false;
    Promise.all([
      getPerson(effectiveReferenceId),
      getPersonRelations(effectiveReferenceId),
      resolvePersonneNumericId(effectiveReferenceId),
      apiRequest<{ success: true; personne: { pereId?: number | null; mereId?: number | null } }>(
        `/personnes/${effectiveReferenceId}`,
      ),
    ])
      .then(([person, relations, numericId, raw]) => {
        if (cancelled) return;
        setReferencePerson(person ?? null);
        setReferenceRelations(relations ?? null);
        setReferenceNumericId(numericId);
        setReferenceParentIds({
          ...(raw.personne.pereId ? { pereId: raw.personne.pereId } : {}),
          ...(raw.personne.mereId ? { mereId: raw.personne.mereId } : {}),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effectiveReferenceId]);

  const existingSlotHolder =
    effectiveMode === "parent" && referenceRelations
      ? parentType === "father"
        ? referenceRelations.father
        : referenceRelations.mother
      : undefined;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isRootPath) {
      if (targetChoice === "existing" && !targetRef) next.target = "Choisissez la personne à rattacher.";
    }
    if (isRootPath && !familyId) next.familyId = "Choisissez une famille.";
    if (isRootPath || targetChoice === "new") {
      if (!identity.firstName.trim()) next.firstName = "Le prénom est requis.";
      if (!identity.lastName.trim()) next.lastName = "Le nom est requis.";
      if (!identity.maritalStatus) next.maritalStatus = "La situation matrimoniale est requise.";
      if (identity.email.trim() && !EMAIL_RE.test(identity.email.trim())) next.email = "Adresse e-mail invalide.";
      if (identity.phone.trim() && !PHONE_RE.test(identity.phone.trim())) next.phone = "Numéro de téléphone invalide.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const order = ["familyId", "target", "firstName", "lastName", "maritalStatus", "email", "phone"];
      focusFirstError(next, order, (field) => `mem-${field}`);
    }
    return Object.keys(next).length === 0;
  }

  function buildIdentityInput(overrides: { familleId: number; pereId?: number; mereId?: number }): PersonneReelleInput {
    return {
      prenom: identity.firstName.trim(),
      nom: identity.lastName.trim(),
      sexe: toGenderApi(identity.gender),
      familleId: overrides.familleId,
      ...(overrides.pereId !== undefined ? { pereId: overrides.pereId } : {}),
      ...(overrides.mereId !== undefined ? { mereId: overrides.mereId } : {}),
      ...(identity.photoUrl.trim() ? { photo: identity.photoUrl.trim() } : {}),
      ...(identity.birthDate ? { dateNaissance: identity.birthDate } : {}),
      ...(identity.birthPlace.trim() ? { lieuNaissance: identity.birthPlace.trim() } : {}),
      estDecede: identity.isDeceased,
      estAuVillage: identity.estAuVillage,
      estEnGuinee: identity.estEnGuinee,
      ...(identity.maritalStatus ? { statutMatrimonial: identity.maritalStatus } : {}),
      ...(identity.profession.trim() ? { profession: identity.profession.trim() } : {}),
      ...(identity.bio.trim() ? { bio: identity.bio.trim() } : {}),
      ...(identity.phone.trim() ? { telephone: identity.phone.trim() } : {}),
      ...(identity.email.trim() ? { email: identity.email.trim() } : {}),
      ...(forcerCreation ? { forcerCreation: true } : {}),
    };
  }

  /** Creates every spouse listed in the "Union(s)" card for `personId`/`personNumericId` (the
   * person just created or reassigned), using `identity.maritalStatus` as the union's statut. */
  async function creerUnionsConjoints(personNumericId: number, familleId: number) {
    if (!identity.maritalStatus || identity.maritalStatus === "celibataire") return;
    for (const ref of spouseRefs) {
      const { id: spouseId } = await resolvePersonRef(ref, familleId);
      await creerUnionReelle(personNumericId, spouseId, identity.maritalStatus as StatutUnionApi);
    }
  }

  async function performCreate() {
    setSaving(true);
    setServerError("");
    try {
      let resultPerson: Person;

      if (effectiveMode === "parent" && referencePerson) {
        const resolvedFamilleId = await resolveFamilleNumericId(referencePerson.familyId);
        if (resolvedFamilleId === undefined) throw new Error("Famille introuvable.");
        if (targetChoice === "existing" && targetRef) {
          const { id } = await resolvePersonRef(targetRef, resolvedFamilleId);
          await patchPersonneReelle(effectiveReferenceId, parentType === "father" ? { pereId: id } : { mereId: id });
          resultPerson = (await getPerson(effectiveReferenceId)) ?? referencePerson;
        } else {
          resultPerson = await creerPersonneReelle(buildIdentityInput({ familleId: resolvedFamilleId }));
          const newId = await resolvePersonneNumericId(resultPerson.id);
          await patchPersonneReelle(effectiveReferenceId, parentType === "father" ? { pereId: newId } : { mereId: newId });
          await creerUnionsConjoints(newId, resolvedFamilleId);
        }
      } else if (effectiveMode === "child" && referencePerson && referenceNumericId !== null) {
        const resolvedFamilleId = await resolveFamilleNumericId(familyId || referencePerson.familyId);
        if (resolvedFamilleId === undefined) throw new Error("Famille introuvable.");
        const fatherIsReference = referencePerson.gender === "male";

        let fatherId: number | undefined = fatherIsReference ? referenceNumericId : undefined;
        let motherId: number | undefined = !fatherIsReference ? referenceNumericId : undefined;
        if (otherParentRef) {
          const { id } = await resolvePersonRef(otherParentRef, resolvedFamilleId);
          if (fatherIsReference) motherId = id;
          else fatherId = id;
        }

        if (targetChoice === "existing" && targetRef) {
          const { uuid } = await resolvePersonRef(targetRef, resolvedFamilleId);
          await patchPersonneReelle(uuid, {
            ...(fatherId !== undefined ? { pereId: fatherId } : {}),
            ...(motherId !== undefined ? { mereId: motherId } : {}),
          });
          resultPerson = (await getPerson(uuid)) ?? referencePerson;
        } else {
          resultPerson = await creerPersonneReelle(
            buildIdentityInput({ familleId: resolvedFamilleId, pereId: fatherId, mereId: motherId }),
          );
        }

        if (fatherId !== undefined && motherId !== undefined && !(await estUnionEntre(fatherId, motherId))) {
          await creerUnionReelle(fatherId, motherId, "marie");
        }
      } else if (effectiveMode === "spouse" && referencePerson && referenceNumericId !== null) {
        const resolvedFamilleId = await resolveFamilleNumericId(referencePerson.familyId);
        if (resolvedFamilleId === undefined) throw new Error("Famille introuvable.");
        if (targetChoice === "existing" && targetRef) {
          const { id, uuid } = await resolvePersonRef(targetRef, resolvedFamilleId);
          await creerUnionReelle(referenceNumericId, id, "marie");
          resultPerson = (await getPerson(uuid)) ?? referencePerson;
        } else {
          resultPerson = await creerPersonneReelle(buildIdentityInput({ familleId: resolvedFamilleId }));
          const newId = await resolvePersonneNumericId(resultPerson.id);
          await creerUnionReelle(referenceNumericId, newId, "marie");
        }
      } else if (effectiveMode === "sibling" && referencePerson) {
        const resolvedFamilleId = await resolveFamilleNumericId(referencePerson.familyId);
        if (resolvedFamilleId === undefined) throw new Error("Famille introuvable.");
        if (targetChoice === "existing" && targetRef) {
          const { uuid } = await resolvePersonRef(targetRef, resolvedFamilleId);
          await patchPersonneReelle(uuid, { ...referenceParentIds });
          resultPerson = (await getPerson(uuid)) ?? referencePerson;
        } else {
          resultPerson = await creerPersonneReelle(
            buildIdentityInput({
              familleId: resolvedFamilleId,
              ...referenceParentIds,
            }),
          );
        }
      } else {
        // Entrée générique : la personne est décrite par sa famille + son père + sa mère (tous
        // deux facultatifs). Sans aucun des deux, elle démarre comme nouvel ancêtre/racine.
        const resolvedFamilleId = await resolveFamilleNumericId(familyId);
        if (resolvedFamilleId === undefined) throw new Error("Famille introuvable.");
        let pereId: number | undefined;
        let mereId: number | undefined;
        if (pereRef) ({ id: pereId } = await resolvePersonRef(pereRef, resolvedFamilleId));
        if (mereRef) ({ id: mereId } = await resolvePersonRef(mereRef, resolvedFamilleId));

        resultPerson = await creerPersonneReelle(buildIdentityInput({ familleId: resolvedFamilleId, pereId, mereId }));

        if (pereId !== undefined && mereId !== undefined && !(await estUnionEntre(pereId, mereId))) {
          await creerUnionReelle(pereId, mereId, "marie");
        }
        const newId = await resolvePersonneNumericId(resultPerson.id);
        await creerUnionsConjoints(newId, resolvedFamilleId);
      }

      setCreated(resultPerson);
      onCreated?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as { doublons?: { id: string; prenom: string; nom: string }[] } | undefined;
        if (details?.doublons?.length) {
          setDuplicates(details.doublons);
          return;
        }
      }
      setServerError(
        messageChampsInvalides(err) ?? (err instanceof ApiError ? err.message : "Impossible d'enregistrer. Réessayez."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await performCreate();
  }

  async function confirmDespiteDuplicates() {
    setDuplicates([]);
    setForcerCreation(true);
    await performCreate();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  async function copyMatricule() {
    if (!created?.matricule) return;
    try {
      await navigator.clipboard.writeText(created.matricule);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  function viewProfile() {
    if (!created) return;
    handleOpenChange(false);
    navigate(`/habitants/${created.id}`);
  }

  function continueWith(nextMode: RelationMode, nextReferenceId: string) {
    seedFresh(nextMode, nextReferenceId);
    setCreated(null);
  }

  const showDuplicates = duplicates.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {showDuplicates ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-accent" />
                Cette personne semble déjà exister
              </DialogTitle>
              <DialogDescription>
                {duplicates.length === 1
                  ? "Une fiche porte déjà ce prénom, ce nom et cette date de naissance."
                  : `${duplicates.length} fiches portent déjà ce prénom, ce nom et cette date de naissance.`}{" "}
                Vérifiez avant de continuer rien n'est fusionné automatiquement.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {duplicates.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.prenom} {d.nom}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                    <Link to={`/habitants/${d.id}`}>Voir la fiche</Link>
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDuplicates([])}>
                Modifier les informations
              </Button>
              <Button type="button" onClick={confirmDespiteDuplicates} disabled={saving}>
                {saving ? "Enregistrement…" : "Continuer quand même"}
              </Button>
            </div>
          </>
        ) : !created ? (
          <>
            <DialogHeader>
              <DialogTitle>Ajouter un membre</DialogTitle>
              {!locked && (
                <DialogDescription>
                  Indiquez sa famille, son père et sa mère si vous les connaissez matricule et
                  génération sont calculés automatiquement par le serveur.
                </DialogDescription>
              )}
            </DialogHeader>
            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {!locked && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rattachement familial</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field id="mem-familyId" label="Famille" required error={errors.familyId}>
                      <Select
                        value={familyId}
                        onValueChange={(v) => {
                          setFamilyId(v);
                          clearError("familyId");
                        }}
                        disabled={!!initialFamilyId || familiesLoading}
                      >
                        <SelectTrigger id="mem-familyId">
                          <SelectValue placeholder={familiesLoading ? "Chargement…" : "Choisir une famille"} />
                        </SelectTrigger>
                        <SelectContent>
                          {families.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field id="mem-pere" label="Père">
                        <PersonPicker label="le père" value={pereRef} onChange={setPereRef} lockedSexe="homme" />
                      </Field>
                      <Field id="mem-mere" label="Mère">
                        <PersonPicker label="la mère" value={mereRef} onChange={setMereRef} lockedSexe="femme" />
                      </Field>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!isRootPath && referencePerson && effectiveMode && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {RELATION_LABELS[effectiveMode]} de {fullName(referencePerson)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {effectiveMode === "parent" && (
                      <div className="space-y-2">
                        <Label>Type de parent</Label>
                        <div className="flex gap-6">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="parent-type"
                              checked={parentType === "father"}
                              onChange={() => setParentType("father")}
                              className="size-4 accent-primary"
                            />
                            Père
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="parent-type"
                              checked={parentType === "mother"}
                              onChange={() => setParentType("mother")}
                              className="size-4 accent-primary"
                            />
                            Mère
                          </label>
                        </div>
                        {existingSlotHolder && (
                          <p className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-foreground">
                            {fullName(referencePerson)} a déjà {parentType === "father" ? "un père" : "une mère"} enregistré·e :{" "}
                            {fullName(existingSlotHolder)}. Continuer le remplacera.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Personne à rattacher</Label>
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="target-choice"
                            checked={targetChoice === "new"}
                            onChange={() => setTargetChoice("new")}
                            className="size-4 accent-primary"
                          />
                          Créer un nouvel habitant
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="target-choice"
                            checked={targetChoice === "existing"}
                            onChange={() => setTargetChoice("existing")}
                            className="size-4 accent-primary"
                          />
                          Sélectionner un habitant existant
                        </label>
                      </div>
                    </div>

                    {targetChoice === "existing" && (
                      <Field id="mem-target" label="Habitant à rattacher" required error={errors.target}>
                        <PersonPicker
                          label="un habitant"
                          value={targetRef}
                          onChange={(v) => {
                            setTargetRef(v);
                            clearError("target");
                          }}
                        />
                      </Field>
                    )}

                    {effectiveMode === "child" && (
                      <Field id="mem-otherParent" label={`Autre parent (${referencePerson.gender === "male" ? "mère" : "père"}) facultatif`}>
                        {referenceRelations && referenceRelations.spouses.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {referenceRelations.spouses.map((sp) => (
                              <button
                                key={sp.id}
                                type="button"
                                onClick={async () => {
                                  const numericId = await resolvePersonneNumericId(sp.id);
                                  setOtherParentRef({
                                    mode: "existant",
                                    id: numericId,
                                    uuid: sp.id,
                                    prenom: sp.firstName,
                                    nom: sp.lastName,
                                    matricule: sp.matricule || null,
                                    sexe: toGenderApi(sp.gender),
                                  });
                                }}
                                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40"
                              >
                                {fullName(sp)}
                              </button>
                            ))}
                          </div>
                        )}
                        <PersonPicker
                          label="l'autre parent"
                          value={otherParentRef}
                          onChange={setOtherParentRef}
                          lockedSexe={referencePerson.gender === "male" ? "femme" : "homme"}
                        />
                      </Field>
                    )}

                    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
                      Génération et matricule seront calculés automatiquement par le serveur.
                    </div>
                  </CardContent>
                </Card>
              )}

              {(isRootPath || targetChoice === "new") && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Identité</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field id="mem-firstName" label="Prénom" required error={errors.firstName}>
                          <Input id="mem-firstName" value={identity.firstName} onChange={(e) => set("firstName", e.target.value)} />
                        </Field>
                        <Field id="mem-lastName" label="Nom" required error={errors.lastName}>
                          <Input
                            id="mem-lastName"
                            value={identity.lastName}
                            onChange={(e) => {
                              setLastNameTouched(true);
                              set("lastName", versMajusculesSansAccent(e.target.value));
                            }}
                            disabled={!isRootPath && (effectiveMode === "child" || effectiveMode === "sibling")}
                          />
                        </Field>
                        {effectiveMode === "parent" ? (
                          <div>
                            <Label className="mb-1.5 block">Sexe</Label>
                            <p className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                              {parentType === "father" ? "Homme (père)" : "Femme (mère)"}
                            </p>
                          </div>
                        ) : (
                          <Field id="mem-gender" label="Sexe" required>
                            <Select value={identity.gender} onValueChange={(v) => set("gender", v as Gender)}>
                              <SelectTrigger id="mem-gender">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">Homme</SelectItem>
                                <SelectItem value="female">Femme</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                        <Field id="mem-birthDate" label="Date de naissance">
                          <Input
                            id="mem-birthDate"
                            type="date"
                            value={identity.birthDate}
                            max={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => set("birthDate", e.target.value)}
                          />
                        </Field>
                        <Field id="mem-birthPlace" label="Lieu de naissance">
                          <Input id="mem-birthPlace" value={identity.birthPlace} onChange={(e) => set("birthPlace", e.target.value)} />
                        </Field>
                        <Field id="mem-profession" label="Profession">
                          <Input id="mem-profession" value={identity.profession} onChange={(e) => set("profession", e.target.value)} />
                        </Field>
                        <Field id="mem-phone" label="Téléphone" error={errors.phone}>
                          <PhoneInput id="mem-phone" value={identity.phone} onValueChange={(v) => set("phone", v)} />
                        </Field>
                        <Field id="mem-email" label="E-mail" error={errors.email}>
                          <Input id="mem-email" type="email" value={identity.email} onChange={(e) => set("email", e.target.value)} />
                        </Field>
                        <Field id="mem-photoUrl" label="Photo (URL)" className="sm:col-span-2">
                          <Input id="mem-photoUrl" value={identity.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="https://…" />
                        </Field>
                        <Field id="mem-maritalStatus" label="Situation matrimoniale" required error={errors.maritalStatus}>
                          <Select value={identity.maritalStatus} onValueChange={(v) => set("maritalStatus", v as MaritalStatus)}>
                            <SelectTrigger id="mem-maritalStatus">
                              <SelectValue placeholder="Choisir…" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="mem-isDeceased"
                          checked={identity.isDeceased}
                          onCheckedChange={(c) => set("isDeceased", c === true)}
                        />
                        <Label htmlFor="mem-isDeceased" className="font-normal">
                          Cette personne est décédée
                        </Label>
                      </div>

                      <GeographicSituationFields
                        idPrefix="mem"
                        estDecede={identity.isDeceased}
                        estAuVillage={identity.estAuVillage}
                        estEnGuinee={identity.estEnGuinee}
                        onChange={(next) =>
                          setIdentity((f) => ({ ...f, estAuVillage: next.estAuVillage, estEnGuinee: next.estEnGuinee }))
                        }
                      />

                      <Field id="mem-bio" label="Observations">
                        <textarea
                          id="mem-bio"
                          value={identity.bio}
                          onChange={(e) => set("bio", e.target.value)}
                          rows={3}
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </Field>
                    </CardContent>
                  </Card>

                  {identity.maritalStatus && identity.maritalStatus !== "celibataire" && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Union(s)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {spouseRefs.map((ref, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="flex-1">
                              <PersonPicker
                                label="un·e conjoint·e"
                                value={ref}
                                onChange={(v) => v && setSpouseRefs(spouseRefs.map((r, idx) => (idx === i ? v : r)))}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setSpouseRefs(spouseRefs.filter((_, idx) => idx !== i))}
                              aria-label="Retirer"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSpouseRefs([
                              ...spouseRefs,
                              { mode: "nouveau", donnees: { prenom: "", nom: "", sexe: identity.gender === "male" ? "femme" : "homme", photo: "", dateNaissance: "", lieuNaissance: "", estDecede: false, statutMatrimonial: "", profession: "", niveauEtudes: "", bio: "", telephone: "", email: "", whatsapp: "", estAuVillage: true, estEnGuinee: true } },
                            ])
                          }
                        >
                          <UserPlus /> Ajouter un·e conjoint·e
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {serverError && (
                <p role="alert" className="text-sm text-destructive">
                  {serverError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  <UserPlus />
                  {saving
                    ? "Enregistrement…"
                    : isRootPath
                      ? "Créer le membre"
                      : targetChoice === "existing"
                        ? "Associer cette personne"
                        : "Créer et associer"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-success" />
                Membre ajouté·e
              </DialogTitle>
              <DialogDescription>
                {fullName(created)} matricule ci-dessous, à conserver pour rattacher ses propres enfants plus tard.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <span className="font-mono text-lg font-semibold tracking-wider text-foreground">{created.matricule}</span>
              <Button type="button" variant="outline" size="sm" onClick={copyMatricule}>
                {copied ? <Check className="text-success" /> : <Copy />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <p className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Famille</span>
                <span className="font-medium text-foreground">{getFamilyByIdSync(created.familyId)?.name ?? "—"}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Génération</span>
                <span className="font-medium text-foreground">
                  {created.generation} <em className="not-italic text-xs text-muted-foreground">(calculée)</em>
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {effectiveMode === "child" && referencePerson && (
                <Button type="button" variant="outline" className="w-full" onClick={() => continueWith("child", referencePerson.id)}>
                  <UserPlus /> Ajouter un autre enfant à {referencePerson.firstName}
                </Button>
              )}
              {effectiveMode === "spouse" && referencePerson && (
                <Button type="button" variant="outline" className="w-full" onClick={() => continueWith("spouse", referencePerson.id)}>
                  <UserPlus /> Ajouter un·e autre conjoint·e à {referencePerson.firstName}
                </Button>
              )}
              {effectiveMode === "sibling" && referencePerson && (
                <Button type="button" variant="outline" className="w-full" onClick={() => continueWith("sibling", referencePerson.id)}>
                  <UserPlus /> Ajouter un autre frère/une autre sœur à {referencePerson.firstName}
                </Button>
              )}
              {effectiveMode === "parent" && referencePerson && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => continueWith("parent", referencePerson.id)}
                >
                  <UserPlus /> Ajouter {parentType === "father" ? "la mère" : "le père"} de {referencePerson.firstName}
                </Button>
              )}
              <Button type="button" variant="outline" className="w-full" onClick={() => continueWith("child", created.id)}>
                <UserPlus /> Ajouter un enfant à {created.firstName}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => continueWith("parent", created.id)}>
                <UserPlus /> Remonter la lignée ajouter le parent de {created.firstName}
              </Button>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fermer
              </Button>
              <Button type="button" onClick={viewProfile}>
                Voir le profil
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
