import { Check, ChevronLeft, ChevronRight, GitFork, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Field } from "@/components/shared/FormField";
import { PersonPicker } from "@/components/auth/PersonPicker";
import { CredentialsDialog } from "@/components/shared/CredentialsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { EMAIL_RE } from "@/lib/utils";
import { focusFirstError } from "@/lib/focus-first-error";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { creerUnionReelle, inscrireCoupleReel } from "@/services/api/people";
import {
  creerFamilleReelle,
  getFamilyChain,
  modifierFamilleReelle,
  resolveFamilleNumericId,
  type FamilyHierarchyEntry,
  type FamilySummary,
} from "@/services/api/families";
import { personRefLabel, toPayloadRef, type CompteAffiche, type PersonRef } from "@/components/auth/inscription-types";

// ---------------------------------------------------------------------------
// Étapes déclaratives — "parente" (choix de la famille parente), puis un
// "couple" par femme (la première porte aussi le choix de l'homme), puis
// "recap". `steps` grandit dynamiquement à chaque "+ Ajouter une femme" ; le
// compteur affiché reflète toujours sa longueur réelle, jamais un total codé
// en dur.
// ---------------------------------------------------------------------------
type Step = { kind: "parente" } | { kind: "couple"; index: number } | { kind: "recap" };

type MoiEntry = {
  key: string;
  role: string;
  ref: Extract<PersonRef, { mode: "nouveau" }>;
  setEmail: (email: string) => void;
};

/**
 * Parcours intelligent spécialisé pour créer une famille descendante — reprend
 * l'intelligence de `NewMemberDialog` (recherche/création de personnes via
 * `PersonPicker`, héritage automatique du nom, comptes/identifiants réels,
 * étapes dynamiques) sans en recopier le formulaire, enrichi de deux
 * capacités UX (voir `AddFoundingFamilyDialog`, même mécanique) :
 *
 * — Couple côte à côte : homme et femme sont présentés sur la même étape,
 *   dans deux cartes côte à côte (responsive : empilées sur mobile).
 * — Polygamie : "+ Ajouter une femme" ouvre une étape dédiée par épouse
 *   supplémentaire (l'homme y est rappelé en lecture seule, comme référence
 *   commune) — jamais toutes les épouses sur un seul écran, jamais deux
 *   épouses fusionnées dans la même union.
 *
 * Nom : toujours hérité de la famille parente choisie (déjà, par
 * construction, le nom de toute la lignée à n'importe quelle profondeur),
 * jamais ressaisi. Seul le nom de l'HOMME hérite via `PersonPicker`'s
 * `nomHerite` s'il est créé à la volée — chaque femme garde le sien,
 * intentionnellement.
 *
 * Comptes/credentials : `POST /auth/inscription` accepte déjà un tableau
 * `unions[]`, donc la polygamie ne change RIEN au contrat backend (voir
 * `inscrireCoupleReel`). Si l'homme est nouveau, un seul appel porte toutes
 * les femmes (chacune dans sa propre union). S'il est déjà existant, chaque
 * femme nouvelle devient à son tour la "principale" de son propre appel
 * (conjoint = l'homme existant) — les femmes déjà existantes ne reçoivent
 * qu'une simple union, sans appel à `/auth/inscription`.
 */
export function AddDescendantFamilyDialog({
  open,
  onOpenChange,
  families,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Toutes les familles actives déjà chargées par la page appelante
   * (`Families.tsx`) — fondatrices ET descendantes, puisqu'une famille
   * parente directe peut être l'une ou l'autre. Jamais re-fetchée ici. */
  families: FamilySummary[];
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const [familleParenteId, setFamilleParenteId] = useState("");
  const [chain, setChain] = useState<FamilyHierarchyEntry[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [hommeRef, setHommeRef] = useState<PersonRef | null>(null);
  const [femmes, setFemmes] = useState<(PersonRef | null)[]>([null]);
  const [description, setDescription] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const { errors, setErrors, clearError } = useFieldErrors();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [created, setCreated] = useState<FamilySummary | null>(null);
  const [pendingComptes, setPendingComptes] = useState<CompteAffiche[] | null>(null);

  const famillesActives = useMemo(() => families.filter((f) => f.estActive), [families]);

  function reset() {
    setFamilleParenteId("");
    setChain([]);
    setHommeRef(null);
    setFemmes([null]);
    setDescription("");
    setCurrentStepIndex(0);
    setErrors({});
    setServerError("");
    setCreated(null);
    setPendingComptes(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    onOpenChange(next);
  }

  // La famille parente choisie détermine automatiquement la lignée
  // fondatrice et la génération — jamais une valeur saisie ou devinée.
  useEffect(() => {
    if (!familleParenteId) {
      setChain([]);
      return;
    }
    setChainLoading(true);
    getFamilyChain(familleParenteId)
      .then(setChain)
      .catch(() => setChain([]))
      .finally(() => setChainLoading(false));
  }, [familleParenteId]);

  const familleParente = famillesActives.find((f) => f.id === familleParenteId);
  const fondatriceLignee = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const nouvelleGeneration = chain.length; // chain[0] = parent lui-même ; longueur = génération du parent + 1
  const nomFamille = familleParente?.name ?? "";

  const steps: Step[] = useMemo(
    () => [{ kind: "parente" }, ...femmes.map((_, index): Step => ({ kind: "couple", index })), { kind: "recap" }],
    [femmes],
  );
  const currentStep = steps[currentStepIndex];
  const isFirstVisible = currentStepIndex === 0;
  const isLastVisible = currentStepIndex === steps.length - 1;

  function setFemmeAt(index: number, ref: PersonRef | null) {
    setFemmes((cur) => cur.map((f, i) => (i === index ? ref : f)));
  }

  function ajouterFemme() {
    setFemmes((cur) => [...cur, null]);
    setCurrentStepIndex((idx) => idx + 1);
  }

  function retirerDerniereFemme() {
    if (femmes.length <= 1) return;
    setFemmes((cur) => cur.slice(0, -1));
    setCurrentStepIndex((idx) => Math.max(0, idx - 1));
  }

  /** Chaque personne qui deviendra une "principale" `/auth/inscription` —
   * l'homme s'il est nouveau, sinon chaque femme nouvelle (une par appel
   * séparé) — peut recevoir un e-mail facultatif pour son compte ; quand il
   * est absent, l'identifiant retombe sur le matricule attribué. */
  function moiList(): MoiEntry[] {
    if (hommeRef && hommeRef.mode === "nouveau") {
      const ref = hommeRef;
      return [{ key: "homme", role: "l'homme", ref, setEmail: (email) => setHommeRef({ ...ref, donnees: { ...ref.donnees, email } }) }];
    }
    const list: MoiEntry[] = [];
    femmes.forEach((f, i) => {
      if (f && f.mode === "nouveau") {
        list.push({
          key: `femme-${i}`,
          role: femmes.length > 1 ? `la femme ${i + 1}` : "la femme",
          ref: f,
          setEmail: (email) => setFemmeAt(i, { ...f, donnees: { ...f.donnees, email } }),
        });
      }
    });
    return list;
  }

  function validateCurrentStep(): boolean {
    const next: Record<string, string> = {};
    if (currentStep.kind === "parente") {
      if (!familleParenteId) next.familleParenteId = "Choisissez la famille parente.";
    } else if (currentStep.kind === "couple") {
      if (currentStep.index === 0 && !hommeRef) next.homme = "Choisissez ou créez l'homme du couple.";
      if (!femmes[currentStep.index]) next.femme = "Choisissez ou créez cette femme.";
    } else {
      for (const m of moiList()) {
        const email = m.ref.donnees.email.trim();
        if (email && !EMAIL_RE.test(email)) {
          next[`email-${m.key}`] = "Adresse e-mail invalide.";
        }
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstError(next, Object.keys(next), (field) => (field === "familleParenteId" ? "desc-parente" : `desc-${field}`));
    }
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setErrors({});
    if (currentStepIndex < steps.length - 1) setCurrentStepIndex(currentStepIndex + 1);
  }

  function goBack() {
    setErrors({});
    if (currentStepIndex > 0) setCurrentStepIndex(currentStepIndex - 1);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validateCurrentStep() || !hommeRef || femmes.some((f) => !f) || !familleParenteId) return;
    setSaving(true);
    try {
      const familleParenteNumericId = await resolveFamilleNumericId(familleParenteId);
      if (familleParenteNumericId === undefined) throw new ApiError(404, "Famille parente introuvable.");

      const famille = await creerFamilleReelle({
        nom: nomFamille,
        ...(description.trim() ? { description: description.trim() } : {}),
        familleParenteId: familleParenteNumericId,
      });
      const familleNumericId = await resolveFamilleNumericId(famille.id);
      if (familleNumericId === undefined) throw new ApiError(500, "Famille introuvable après création.");

      const comptes: CompteAffiche[] = [];
      let hommeId: number;
      const femmeRole = (i: number) => (femmes.length > 1 ? `Femme ${i + 1}` : "Femme");

      if (hommeRef.mode === "nouveau") {
        const { principal, conjoints } = await inscrireCoupleReel({
          prenom: hommeRef.donnees.prenom.trim(),
          nom: hommeRef.donnees.nom.trim(),
          sexe: hommeRef.donnees.sexe,
          ...(hommeRef.donnees.email.trim() ? { email: hommeRef.donnees.email.trim() } : {}),
          ...(hommeRef.donnees.telephone.trim() ? { telephone: hommeRef.donnees.telephone.trim() } : {}),
          ...(hommeRef.donnees.dateNaissance ? { dateNaissance: hommeRef.donnees.dateNaissance } : {}),
          ...(hommeRef.donnees.lieuNaissance.trim() ? { lieuNaissance: hommeRef.donnees.lieuNaissance.trim() } : {}),
          ...(hommeRef.donnees.profession.trim() ? { profession: hommeRef.donnees.profession.trim() } : {}),
          familleId: familleNumericId,
          conjoints: femmes.map((f) => toPayloadRef(f as PersonRef)),
        });
        comptes.push({
          role: "Homme",
          nomComplet: `${principal.prenom} ${principal.nom}`,
          ...(principal.matricule ? { matricule: principal.matricule } : {}),
          identifiant: principal.compte.identifiant,
          motDePasseTemporaire: principal.compte.motDePasseTemporaire,
        });
        conjoints.forEach((c, i) => {
          if (c.cree && c.compte) {
            comptes.push({
              role: femmeRole(i),
              nomComplet: `${c.prenom} ${c.nom}`,
              ...(c.matricule ? { matricule: c.matricule } : {}),
              identifiant: c.compte.identifiant,
              motDePasseTemporaire: c.compte.motDePasseTemporaire,
            });
          }
        });
        hommeId = principal.id;
      } else {
        hommeId = hommeRef.id;
        for (let i = 0; i < femmes.length; i++) {
          const femme = femmes[i] as PersonRef;
          if (femme.mode === "existant") {
            await creerUnionReelle(hommeId, femme.id, "marie");
          } else {
            const { principal } = await inscrireCoupleReel({
              prenom: femme.donnees.prenom.trim(),
              nom: femme.donnees.nom.trim(),
              sexe: femme.donnees.sexe,
              ...(femme.donnees.email.trim() ? { email: femme.donnees.email.trim() } : {}),
              ...(femme.donnees.telephone.trim() ? { telephone: femme.donnees.telephone.trim() } : {}),
              ...(femme.donnees.dateNaissance ? { dateNaissance: femme.donnees.dateNaissance } : {}),
              ...(femme.donnees.lieuNaissance.trim() ? { lieuNaissance: femme.donnees.lieuNaissance.trim() } : {}),
              ...(femme.donnees.profession.trim() ? { profession: femme.donnees.profession.trim() } : {}),
              familleId: familleNumericId,
              conjoints: [toPayloadRef(hommeRef)],
            });
            comptes.push({
              role: femmeRole(i),
              nomComplet: `${principal.prenom} ${principal.nom}`,
              ...(principal.matricule ? { matricule: principal.matricule } : {}),
              identifiant: principal.compte.identifiant,
              motDePasseTemporaire: principal.compte.motDePasseTemporaire,
            });
          }
        }
      }

      const finalFamily = await modifierFamilleReelle(famille.id, { ancetreId: hommeId });

      setCreated(finalFamily);
      if (comptes.length > 0) setPendingComptes(comptes);
      onCreated?.();
    } catch (err) {
      setServerError(
        messageChampsInvalides(err) ??
          (err instanceof ApiError ? err.message : "Impossible de créer la famille descendante pour le moment."),
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCredentialsContinue() {
    setPendingComptes(null);
  }

  function viewFamily() {
    if (!created) return;
    handleOpenChange(false);
    navigate(`/familles/${created.id}`);
  }

  if (pendingComptes) {
    return <CredentialsDialog open comptes={pendingComptes} onContinue={handleCredentialsContinue} />;
  }

  // Pressing Enter in a text field natively submits the enclosing <form>
  // even at an intermediate step (no submit button rendered there) — same
  // fix as NewMemberDialog: Enter now advances one step, like "Suivant",
  // instead of reaching handleSubmit() early. Only the true last step submits.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement || isLastVisible) return;
    e.preventDefault();
    goNext();
  }

  const stepTitle =
    currentStep.kind === "parente"
      ? "Famille parente"
      : currentStep.kind === "recap"
        ? "Récapitulatif"
        : femmes.length > 1
          ? `Femme ${currentStep.index + 1}`
          : "Le couple";
  const stepDescription =
    currentStep.kind === "parente"
      ? "Cette nouvelle famille descendante en héritera automatiquement le nom."
      : currentStep.kind === "recap"
        ? "Vérifiez les informations avant de créer réellement la famille."
        : currentStep.index === 0
          ? "Recherchez chaque personne, ou créez-la si elle n'existe pas encore."
          : "L'homme reste le même ; recherchez ou créez cette femme supplémentaire.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Créer une famille descendante Étape {currentStepIndex + 1}/{steps.length} · {stepTitle}
              </DialogTitle>
              <DialogDescription>{stepDescription}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="space-y-4">
              {currentStep.kind === "parente" && (
                <div className="space-y-3">
                  <Field id="desc-parente" label="Famille parente" required error={errors.familleParenteId}>
                    <Select
                      value={familleParenteId}
                      onValueChange={(v) => {
                        setFamilleParenteId(v);
                        clearError("familleParenteId");
                      }}
                    >
                      <SelectTrigger id="desc-parente">
                        <SelectValue placeholder="Choisir une famille" />
                      </SelectTrigger>
                      <SelectContent>
                        {famillesActives.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} Génération {f.generation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {familleParenteId && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                      {chainLoading ? (
                        "Chargement…"
                      ) : (
                        fondatriceLignee && (
                          <>
                            <p>
                              Lignée fondatrice : <span className="font-medium text-foreground">{fondatriceLignee.name}</span>
                            </p>
                            <p>Cette nouvelle famille sera en génération {nouvelleGeneration}.</p>
                          </>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentStep.kind === "couple" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">👨 Homme</p>
                      {currentStep.index === 0 ? (
                        <PersonPicker
                          label="l'homme"
                          value={hommeRef}
                          onChange={(v) => {
                            setHommeRef(v);
                            clearError("homme");
                          }}
                          lockedSexe="homme"
                          nomHerite={nomFamille || undefined}
                        />
                      ) : (
                        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          {hommeRef ? personRefLabel(hommeRef) : "—"}
                        </p>
                      )}
                      {errors.homme && <p className="text-xs text-destructive">{errors.homme}</p>}
                    </div>
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">👩 {femmes.length > 1 ? `Femme ${currentStep.index + 1}` : "Femme"}</p>
                      <PersonPicker
                        label="la femme"
                        value={femmes[currentStep.index]}
                        onChange={(ref) => {
                          setFemmeAt(currentStep.index, ref);
                          clearError("femme");
                        }}
                        lockedSexe="femme"
                      />
                      {errors.femme && <p className="text-xs text-destructive">{errors.femme}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Si l'homme est créé à la volée, son nom hérite automatiquement de « {nomFamille} ». Chaque femme garde
                    le sien.
                  </p>
                  {currentStep.index === femmes.length - 1 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button type="button" variant="outline" size="sm" onClick={ajouterFemme}>
                        <Plus className="size-4" />
                        Ajouter une femme
                      </Button>
                      {femmes.length > 1 && (
                        <button
                          type="button"
                          onClick={retirerDerniereFemme}
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                        >
                          Retirer cette femme
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentStep.kind === "recap" && (
                <div className="space-y-4 text-sm">
                  <section>
                    <p className="font-medium">Famille</p>
                    <p className="text-muted-foreground">
                      Famille parente : {familleParente?.name} génération {familleParente?.generation}
                    </p>
                    {fondatriceLignee && <p className="text-muted-foreground">Lignée fondatrice : {fondatriceLignee.name}</p>}
                    <p className="text-muted-foreground">
                      Nouvelle famille : <span className="font-medium text-foreground">{nomFamille}</span> (hérité
                      automatiquement)
                    </p>
                    <p className="text-muted-foreground">Génération : {nouvelleGeneration}</p>
                  </section>
                  <section>
                    <p className="font-medium">Couple{femmes.length > 1 ? " (polygame)" : ""}</p>
                    <p className="text-muted-foreground">
                      Homme : {hommeRef ? personRefLabel(hommeRef) : "—"}
                      {hommeRef?.mode === "nouveau" && <span className="ml-1 text-xs text-accent">(nouveau)</span>}
                    </p>
                    {femmes.map((f, i) => (
                      <p key={i} className="text-muted-foreground">
                        {femmes.length > 1 ? `Femme ${i + 1}` : "Femme"} : {f ? personRefLabel(f) : "—"}
                        {f?.mode === "nouveau" && <span className="ml-1 text-xs text-accent">(nouvelle)</span>}
                      </p>
                    ))}
                  </section>
                  {moiList().map((m) => (
                    <Field
                      key={m.key}
                      id={`desc-email-${m.key}`}
                      label={`E-mail pour le compte de ${m.ref.donnees.prenom || m.role}`}
                      error={errors[`email-${m.key}`]}
                    >
                      <Input
                        id={`desc-email-${m.key}`}
                        type="email"
                        value={m.ref.donnees.email}
                        onChange={(e) => {
                          m.setEmail(e.target.value);
                          clearError(`email-${m.key}`);
                        }}
                        placeholder="exemple@moussidalheire.gn"
                      />
                    </Field>
                  ))}
                  <Field id="desc-description" label="Description courte">
                    <textarea
                      id="desc-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </Field>
                </div>
              )}

              {serverError && (
                <p role="alert" className="text-sm text-destructive">
                  {serverError}
                </p>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => (isFirstVisible ? handleOpenChange(false) : goBack())}>
                  <ChevronLeft className="size-4" />
                  {isFirstVisible ? "Annuler" : "Précédent"}
                </Button>
                {!isLastVisible ? (
                  <Button type="button" onClick={goNext}>
                    Suivant
                    <ChevronRight className="size-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={saving}>
                    <GitFork />
                    {saving ? "Création…" : "Créer la famille descendante"}
                  </Button>
                )}
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-success" />
                Famille descendante créée
              </DialogTitle>
              <DialogDescription>
                {created.name} rejoint la lignée {fondatriceLignee?.name ?? familleParente?.name}, en génération{" "}
                {created.generation}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fermer
              </Button>
              <Button type="button" onClick={viewFamily}>
                Voir la famille
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
