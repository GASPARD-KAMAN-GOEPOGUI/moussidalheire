import { Check, ChevronLeft, ChevronRight, Plus, UsersRound } from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
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
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { EMAIL_RE } from "@/lib/utils";
import { focusFirstError } from "@/lib/focus-first-error";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { creerUnionReelle, inscrireCoupleReel } from "@/services/api/people";
import { creerFamilleReelle, modifierFamilleReelle, resolveFamilleNumericId, type FamilySummary } from "@/services/api/families";
import { personRefLabel, toPayloadRef, type CompteAffiche, type PersonRef } from "@/components/auth/inscription-types";

// ---------------------------------------------------------------------------
// Étapes déclaratives — un "couple" par épouse (la première porte aussi le
// choix du fondateur), toujours suivies du récapitulatif. `steps` grandit
// dynamiquement à chaque "+ Ajouter une femme" ; le compteur affiché reflète
// toujours sa longueur réelle, jamais un total codé en dur.
// ---------------------------------------------------------------------------
type Step = { kind: "couple"; index: number } | { kind: "recap" };

type MoiEntry = {
  key: string;
  role: string;
  ref: Extract<PersonRef, { mode: "nouveau" }>;
  setEmail: (email: string) => void;
};

/**
 * Parcours intelligent pour fonder une nouvelle lignée — même mécanique que
 * `AddDescendantFamilyDialog` (recherche/création via `PersonPicker`,
 * héritage automatique du nom, comptes/credentials réels, étapes dynamiques),
 * enrichie de deux capacités UX :
 *
 * — Couple côte à côte : fondateur et fondatrice sont présentés sur la même
 *   étape, dans deux cartes cote à cote (responsive : empilées sur mobile).
 * — Polygamie : "+ Ajouter une femme" ouvre une étape dédiée par épouse
 *   supplémentaire (le fondateur y est rappelé en lecture seule, comme
 *   référence commune) — jamais toutes les épouses sur un seul écran, jamais
 *   deux épouses fusionnées dans la même union.
 *
 * Nom : vient exclusivement du fondateur (son nom réel s'il existe déjà, ou
 * celui saisi une seule fois s'il est créé) — jamais ressaisi. Chaque
 * fondatrice garde le sien, qu'elle soit existante ou nouvelle (`PersonPicker`
 * n'utilise jamais `nomHerite` pour elle).
 *
 * Comptes/credentials : `POST /personnes` ne crée jamais de compte, seul
 * `POST /auth/inscription` le fait (voir `inscrireCoupleReel`) — lequel
 * accepte déjà un tableau `unions[]`, donc la polygamie ne change RIEN au
 * contrat backend. Si le fondateur est nouveau, un seul appel porte toutes
 * les épouses (chacune dans sa propre union). S'il est déjà existant, chaque
 * épouse nouvelle devient à son tour la "principale" de son propre appel
 * (conjoint = le fondateur existant) — les épouses déjà existantes ne
 * reçoivent qu'une simple union, sans appel à `/auth/inscription`.
 */
export function AddFoundingFamilyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const [fondateurRef, setFondateurRef] = useState<PersonRef | null>(null);
  const [fondatrices, setFondatrices] = useState<(PersonRef | null)[]>([null]);
  const [description, setDescription] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const { errors, setErrors, clearError } = useFieldErrors();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [created, setCreated] = useState<FamilySummary | null>(null);
  const [pendingComptes, setPendingComptes] = useState<CompteAffiche[] | null>(null);

  function reset() {
    setFondateurRef(null);
    setFondatrices([null]);
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

  const steps: Step[] = useMemo(
    () => [...fondatrices.map((_, index): Step => ({ kind: "couple", index })), { kind: "recap" }],
    [fondatrices],
  );
  const currentStep = steps[currentStepIndex];
  const isFirstVisible = currentStepIndex === 0;
  const isLastVisible = currentStepIndex === steps.length - 1;

  // Le nom de la lignée vient exclusivement du fondateur — existant (son nom
  // réel) ou nouveau (le nom qu'il reçoit à sa création) — jamais ressaisi.
  const nomFamille = fondateurRef
    ? fondateurRef.mode === "existant"
      ? fondateurRef.nom
      : fondateurRef.donnees.nom.trim()
    : "";

  function setFondatriceAt(index: number, ref: PersonRef | null) {
    setFondatrices((cur) => cur.map((f, i) => (i === index ? ref : f)));
  }

  function ajouterEpouse() {
    setFondatrices((cur) => [...cur, null]);
    setCurrentStepIndex((idx) => idx + 1);
  }

  function retirerDerniereEpouse() {
    if (fondatrices.length <= 1) return;
    setFondatrices((cur) => cur.slice(0, -1));
    setCurrentStepIndex((idx) => Math.max(0, idx - 1));
  }

  /** Chaque personne qui deviendra une "principale" `/auth/inscription` —
   * le fondateur s'il est nouveau, sinon chaque épouse nouvelle (une par
   * appel séparé) — peut recevoir un e-mail facultatif pour son compte ;
   * quand il est absent, l'identifiant retombe sur le matricule attribué. */
  function moiList(): MoiEntry[] {
    if (fondateurRef && fondateurRef.mode === "nouveau") {
      const ref = fondateurRef;
      return [{ key: "fondateur", role: "le fondateur", ref, setEmail: (email) => setFondateurRef({ ...ref, donnees: { ...ref.donnees, email } }) }];
    }
    const list: MoiEntry[] = [];
    fondatrices.forEach((f, i) => {
      if (f && f.mode === "nouveau") {
        list.push({
          key: `femme-${i}`,
          role: fondatrices.length > 1 ? `la fondatrice ${i + 1}` : "la fondatrice",
          ref: f,
          setEmail: (email) => setFondatriceAt(i, { ...f, donnees: { ...f.donnees, email } }),
        });
      }
    });
    return list;
  }

  function validateCurrentStep(): boolean {
    const next: Record<string, string> = {};
    if (currentStep.kind === "couple") {
      if (currentStep.index === 0 && !fondateurRef) {
        next.fondateur = "Le fondateur est requis une famille fondatrice part toujours d'un couple.";
      }
      if (!fondatrices[currentStep.index]) {
        next.fondatrice = "La fondatrice est requise une famille fondatrice part toujours d'un couple.";
      }
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
      focusFirstError(next, Object.keys(next), (field) => `fond-${field}`);
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
    if (!validateCurrentStep() || !fondateurRef || fondatrices.some((f) => !f)) return;
    setSaving(true);
    try {
      // Jamais de familleParenteId : une famille fondatrice est toujours une racine.
      const famille = await creerFamilleReelle({
        nom: nomFamille,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      const familleNumericId = await resolveFamilleNumericId(famille.id);
      if (familleNumericId === undefined) throw new ApiError(500, "Famille introuvable après création.");

      const comptes: CompteAffiche[] = [];
      let fondateurId: number;
      const epouseRole = (i: number) => (fondatrices.length > 1 ? `Fondatrice ${i + 1}` : "Fondatrice");

      if (fondateurRef.mode === "nouveau") {
        const { principal, conjoints } = await inscrireCoupleReel({
          prenom: fondateurRef.donnees.prenom.trim(),
          nom: fondateurRef.donnees.nom.trim(),
          sexe: fondateurRef.donnees.sexe,
          ...(fondateurRef.donnees.email.trim() ? { email: fondateurRef.donnees.email.trim() } : {}),
          ...(fondateurRef.donnees.telephone.trim() ? { telephone: fondateurRef.donnees.telephone.trim() } : {}),
          ...(fondateurRef.donnees.dateNaissance ? { dateNaissance: fondateurRef.donnees.dateNaissance } : {}),
          ...(fondateurRef.donnees.lieuNaissance.trim() ? { lieuNaissance: fondateurRef.donnees.lieuNaissance.trim() } : {}),
          ...(fondateurRef.donnees.profession.trim() ? { profession: fondateurRef.donnees.profession.trim() } : {}),
          familleId: familleNumericId,
          conjoints: fondatrices.map((f) => toPayloadRef(f as PersonRef)),
        });
        comptes.push({
          role: "Fondateur",
          nomComplet: `${principal.prenom} ${principal.nom}`,
          ...(principal.matricule ? { matricule: principal.matricule } : {}),
          identifiant: principal.compte.identifiant,
          motDePasseTemporaire: principal.compte.motDePasseTemporaire,
        });
        conjoints.forEach((c, i) => {
          if (c.cree && c.compte) {
            comptes.push({
              role: epouseRole(i),
              nomComplet: `${c.prenom} ${c.nom}`,
              ...(c.matricule ? { matricule: c.matricule } : {}),
              identifiant: c.compte.identifiant,
              motDePasseTemporaire: c.compte.motDePasseTemporaire,
            });
          }
        });
        fondateurId = principal.id;
      } else {
        fondateurId = fondateurRef.id;
        for (let i = 0; i < fondatrices.length; i++) {
          const femme = fondatrices[i] as PersonRef;
          if (femme.mode === "existant") {
            await creerUnionReelle(fondateurId, femme.id, "marie");
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
              conjoints: [toPayloadRef(fondateurRef)],
            });
            comptes.push({
              role: epouseRole(i),
              nomComplet: `${principal.prenom} ${principal.nom}`,
              ...(principal.matricule ? { matricule: principal.matricule } : {}),
              identifiant: principal.compte.identifiant,
              motDePasseTemporaire: principal.compte.motDePasseTemporaire,
            });
          }
        }
      }

      const finalFamily = await modifierFamilleReelle(famille.id, { ancetreId: fondateurId });

      setCreated(finalFamily);
      if (comptes.length > 0) setPendingComptes(comptes);
      onCreated?.();
    } catch (err) {
      setServerError(
        messageChampsInvalides(err) ??
          (err instanceof ApiError ? err.message : "Impossible de créer la famille fondatrice pour le moment."),
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
    currentStep.kind === "recap" ? "Récapitulatif" : fondatrices.length > 1 ? `Épouse ${currentStep.index + 1}` : "Le couple";
  const stepDescription =
    currentStep.kind === "recap"
      ? "Vérifiez les informations avant de créer réellement la famille fondatrice."
      : currentStep.index === 0
        ? "Recherchez le fondateur et la fondatrice, ou créez-les son nom à lui déterminera celui de la lignée."
        : "Le fondateur reste le même ; recherchez ou créez cette épouse supplémentaire.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Créer une famille fondatrice Étape {currentStepIndex + 1}/{steps.length} · {stepTitle}
              </DialogTitle>
              <DialogDescription>{stepDescription}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="space-y-4">
              {currentStep.kind === "couple" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">👨 Fondateur</p>
                      {currentStep.index === 0 ? (
                        <PersonPicker
                          label="le fondateur"
                          value={fondateurRef}
                          onChange={(v) => {
                            setFondateurRef(v);
                            clearError("fondateur");
                          }}
                          lockedSexe="homme"
                        />
                      ) : (
                        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                          {fondateurRef ? personRefLabel(fondateurRef) : "—"}
                        </p>
                      )}
                      {errors.fondateur && <p className="text-xs text-destructive">{errors.fondateur}</p>}
                    </div>
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">
                        👩 {fondatrices.length > 1 ? `Fondatrice ${currentStep.index + 1}` : "Fondatrice"}
                      </p>
                      <PersonPicker
                        label="la fondatrice"
                        value={fondatrices[currentStep.index]}
                        onChange={(ref) => {
                          setFondatriceAt(currentStep.index, ref);
                          clearError("fondatrice");
                        }}
                        lockedSexe="femme"
                      />
                      {errors.fondatrice && <p className="text-xs text-destructive">{errors.fondatrice}</p>}
                    </div>
                  </div>
                  {fondateurRef && nomFamille && (
                    <p className="text-xs text-muted-foreground">
                      Lignée familiale : <span className="font-medium text-foreground">{nomFamille}</span> la fondatrice
                      garde son propre nom.
                    </p>
                  )}
                  {currentStep.index === fondatrices.length - 1 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button type="button" variant="outline" size="sm" onClick={ajouterEpouse}>
                        <Plus className="size-4" />
                        Ajouter une femme
                      </Button>
                      {fondatrices.length > 1 && (
                        <button
                          type="button"
                          onClick={retirerDerniereEpouse}
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                        >
                          Retirer cette épouse
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {currentStep.kind === "recap" && (
                <div className="space-y-4 text-sm">
                  <section>
                    <p className="font-medium">Famille fondatrice</p>
                    <p className="text-muted-foreground">{nomFamille}</p>
                  </section>
                  <section>
                    <p className="font-medium">Couple fondateur{fondatrices.length > 1 ? " (polygame)" : ""}</p>
                    <p className="text-muted-foreground">
                      Fondateur : {fondateurRef ? personRefLabel(fondateurRef) : "—"}
                      {fondateurRef?.mode === "nouveau" && <span className="ml-1 text-xs text-accent">(nouveau)</span>}
                    </p>
                    {fondatrices.map((f, i) => (
                      <p key={i} className="text-muted-foreground">
                        {fondatrices.length > 1 ? `Fondatrice ${i + 1}` : "Fondatrice"} : {f ? personRefLabel(f) : "—"}
                        {f?.mode === "nouveau" && <span className="ml-1 text-xs text-accent">(nouvelle)</span>}
                      </p>
                    ))}
                  </section>
                  <section>
                    <p className="font-medium">Statut</p>
                    <p className="text-muted-foreground">Génération : 0</p>
                    <p className="text-muted-foreground">Famille parente : Aucune famille racine</p>
                  </section>
                  {moiList().map((m) => (
                    <Field
                      key={m.key}
                      id={`fond-email-${m.key}`}
                      label={`E-mail pour le compte de ${m.ref.donnees.prenom || m.role}`}
                      error={errors[`email-${m.key}`]}
                    >
                      <Input
                        id={`fond-email-${m.key}`}
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
                  <Field id="fond-description" label="Description courte">
                    <textarea
                      id="fond-description"
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
                    <UsersRound />
                    {saving ? "Création…" : "Créer la famille fondatrice"}
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
                Famille fondatrice créée
              </DialogTitle>
              <DialogDescription>
                {created.name} rejoint le registre du village, avec son couple fondateur en génération 0.
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
