import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import { apiRequest, ApiError } from "@/lib/api-client";
import { champsInvalides, messageChampsInvalides } from "@/lib/api-error-fields";
import { focusFirstError } from "@/lib/focus-first-error";
import { useAuthStore, type AuthUtilisateur } from "@/store/useAuthStore";
import { cn, versMajusculesSansAccent, EMAIL_RE, PHONE_RE } from "@/lib/utils";
import { CredentialsDialog } from "@/components/shared/CredentialsDialog";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { PereSearchModal } from "./PereSearchModal";
import { ConjointesSuggestions } from "./ConjointesSuggestions";
import { ProfilePhotoField } from "./ProfilePhotoField";
import { GeographicSituationFields } from "@/components/people/GeographicSituationFields";
import {
  emptyNouvellePersonne,
  initiales,
  personRefLabel,
  toPayloadRef,
  type ApiPersonneResume,
  type CompteAffiche,
  type NouvellePersonneForm,
  type PersonRef,
} from "./inscription-types";

interface PersonnesResponse {
  success: true;
  personnes: ApiPersonneResume[];
}

interface ConjointsResponse {
  success: true;
  conjoints: ApiPersonneResume[];
}

interface PersonneLieeApi {
  id: number;
  uuid: string;
  matricule: string | null;
  prenom: string;
  nom: string;
  sexe: "homme" | "femme";
  cree: boolean;
  /** Présent uniquement quand `cree` est vrai — voir CompteCree côté backend. */
  compte?: { identifiant: string; motDePasseTemporaire: string };
}

interface InscriptionResponse {
  success: true;
  message: string;
  personne: { id: number; prenom: string; nom: string; matricule: string | null };
  utilisateur: AuthUtilisateur;
  token: string;
  refreshToken: string;
  motDePasseTemporaire: string;
  pere?: PersonneLieeApi;
  mere?: PersonneLieeApi;
}

/** Construit la liste des comptes à afficher dans `CredentialsDialog` — un
 * par personne réellement créée par cette inscription (`cree: true`, donc
 * porteuse d'un `compte`) ; une personne déjà existante, simplement
 * rattachée, n'y figure jamais. La personne principale a toujours un compte
 * (elle vient d'être créée par définition) et n'a pas besoin de `cree`. */
function buildComptesCrees(res: InscriptionResponse): CompteAffiche[] {
  const comptes: CompteAffiche[] = [
    {
      role: "Vous",
      nomComplet: `${res.personne.prenom} ${res.personne.nom}`,
      ...(res.personne.matricule ? { matricule: res.personne.matricule } : {}),
      identifiant: res.utilisateur.identifiant,
      motDePasseTemporaire: res.motDePasseTemporaire,
    },
  ];

  function ajouter(p: PersonneLieeApi | undefined, role: string) {
    if (!p || !p.cree || !p.compte) return;
    comptes.push({
      role,
      nomComplet: `${p.prenom} ${p.nom}`,
      ...(p.matricule ? { matricule: p.matricule } : {}),
      identifiant: p.compte.identifiant,
      motDePasseTemporaire: p.compte.motDePasseTemporaire,
    });
  }

  ajouter(res.pere, "Père");
  ajouter(res.mere, "Mère");

  return comptes;
}

// Champs de "Vos informations", volontairement limités à ce que le
// recensement exige (voir mission) : photo, prénom, nom, date de naissance,
// genre, e-mail, téléphone — lieu de naissance/profession/situation
// matrimoniale ne sont plus demandés à cette étape. L'e-mail est facultatif
// (comme partout ailleurs dans l'app, voir `Personne.email` dans
// schema.prisma) : quand il est absent, l'identifiant de connexion retombe
// sur le matricule attribué par le backend (voir auth.service.ts::inscrire),
// affiché une seule fois dans CredentialsDialog.
/** true si le message pour ce champ est une simple invite à compléter
 * l'étape (affichée en bleu), plutôt qu'un vrai échec de validation — format
 * invalide, recherche en échec (reste en rouge). */
function estMessageInfo(field: string): boolean {
  return field !== "telephone" && field !== "email";
}

/** Règle de validation d'un seul champ de l'étape "identite" — extraite pour
 * que `validateCurrentStep` reste lisible malgré les quatre champs à
 * vérifier. */
function identiteFieldError(
  field: "prenom" | "nom" | "email" | "telephone",
  value: { prenom: string; nom: string; email: string; telephone: string },
): string | undefined {
  switch (field) {
    case "prenom":
      return value.prenom.trim() ? undefined : "Le prénom est requis.";
    case "nom":
      return value.nom.trim() ? undefined : "Le nom est requis.";
    case "email":
      return value.email.trim() && !EMAIL_RE.test(value.email.trim()) ? "Adresse e-mail invalide." : undefined;
    case "telephone":
      return value.telephone.trim() && !PHONE_RE.test(value.telephone.trim())
        ? "Numéro de téléphone invalide."
        : undefined;
  }
}

/** Associe chaque champ (clé de `errors`) à l'id DOM de son input, par étape
 * — utilisé pour poser le focus sur le premier champ invalide après un
 * « Suivant » refusé. */
function focusIdForStep(stepId: StepId, field: string): string | undefined {
  switch (stepId) {
    case "identite":
      return `new-${field}`;
    case "matricule-saisie":
      return field === "matricule" ? "matricule-input" : undefined;
    case "creation-pere":
      if (field === "pere") return "pere-creation-prenom";
      if (field === "mere") return "mere-creation-prenom";
      return undefined;
    case "mere":
      return field === "mere" ? "mere-creation-prenom" : undefined;
    default:
      return undefined;
  }
}

const emptyIdentite = {
  photo: "",
  prenom: "",
  nom: "",
  sexe: "homme" as "homme" | "femme",
  email: "",
  telephone: "",
  dateNaissance: "",
  estAuVillage: true,
  estEnGuinee: true,
};

// ---------------------------------------------------------------------------
// Étapes déclaratives — un ordre fixe, chaque étape se rend visible ou non
// selon les réponses déjà données. `visibleSteps` (calculé plus bas) filtre
// cet ordre à chaque rendu : c'est LUI qui pilote le compteur et la
// navigation, jamais un numéro codé en dur.
//
// Recensement de parenté simplifié : PÈRE → MÈRE → VOUS. La fratrie, les
// conjoint(e)s et les enfants ne sont plus demandés ici — ils se construisent
// plus tard depuis l'espace personnel, une fois connecté·e.
// ---------------------------------------------------------------------------
type StepId =
  | "matricule-connu"
  | "matricule-saisie"
  | "recherche-pere"
  | "creation-pere"
  | "mere"
  | "identite"
  | "recap";

const STEP_ORDER: StepId[] = [
  "matricule-connu",
  "matricule-saisie",
  "recherche-pere",
  "creation-pere",
  "mere",
  "identite",
  "recap",
];

const STEP_META: Record<StepId, { title: string; description: string }> = {
  "matricule-connu": {
    title: "Votre père",
    description: "Cette information nous permet de vous rattacher automatiquement à votre famille.",
  },
  "matricule-saisie": {
    title: "Matricule du père",
    description: "Le matricule identifie une fiche de façon unique dans le registre du village.",
  },
  "recherche-pere": {
    title: "Recherche de votre père",
    description: "Recherchons votre père dans le registre du village, par son nom.",
  },
  "creation-pere": {
    title: "Vos parents",
    description:
      "Votre père n'a pas été trouvé dans le registre créons ses informations et celles de votre mère ; vous pourrez les compléter plus tard.",
  },
  mere: {
    title: "Votre mère",
    description: "Votre père est connu indiquons maintenant votre mère.",
  },
  identite: {
    title: "Vos informations",
    description: "Ces informations constitueront votre fiche personnelle.",
  },
  recap: {
    title: "Récapitulatif",
    description: "Vérifiez toutes les informations avant de créer votre compte.",
  },
};

/**
 * Fiche minimale pour un père/une mère créé·e à la volée pendant
 * l'inscription — volontairement réduite à ce que le recensement exige au
 * minimum (photo, prénom, nom, vivant/décédé). Le sexe n'est JAMAIS
 * demandé : il est déterminé par le rôle (père = homme, mère = femme) avant
 * même l'ouverture de ce formulaire (voir `emptyNouvellePersonne`) et ce
 * composant ne l'affiche jamais. Adaptation locale à ce dialogue plutôt
 * qu'une modification de `NouvellePersonneFields` (le formulaire complet
 * reste nécessaire ailleurs — conjoint·e·s/enfants ajoutés depuis l'espace
 * personnel, fondateurs de famille, etc.).
 */
function FicheMinimale({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: NouvellePersonneForm;
  onChange: (value: NouvellePersonneForm) => void;
}) {
  const set = <K extends keyof NouvellePersonneForm>(key: K, v: NouvellePersonneForm[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <ProfilePhotoField value={value.photo} onChange={(url) => set("photo", url)} prenom={value.prenom} nom={value.nom} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-prenom`} label="Prénom" required>
          <Input id={`${idPrefix}-prenom`} value={value.prenom} onChange={(e) => set("prenom", e.target.value)} />
        </Field>
        <Field id={`${idPrefix}-nom`} label="Nom" required>
          <Input
            id={`${idPrefix}-nom`}
            value={value.nom}
            onChange={(e) => set("nom", versMajusculesSansAccent(e.target.value))}
          />
        </Field>
      </div>
      <Field id={`${idPrefix}-vivant`} label="Vivant(e) ?">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={!value.estDecede ? "default" : "outline"} onClick={() => set("estDecede", false)}>
            Oui
          </Button>
          <Button type="button" variant={value.estDecede ? "default" : "outline"} onClick={() => set("estDecede", true)}>
            Non
          </Button>
        </div>
      </Field>
      <GeographicSituationFields
        idPrefix={idPrefix}
        estDecede={value.estDecede}
        estAuVillage={value.estAuVillage}
        estEnGuinee={value.estEnGuinee}
        onChange={(next) => onChange({ ...value, estAuVillage: next.estAuVillage, estEnGuinee: next.estEnGuinee })}
      />
    </div>
  );
}

/**
 * Self-registration ("Nouveau membre" sur l'écran de connexion) — parcours
 * guidé à étapes DYNAMIQUES (le nombre total dépend des réponses données),
 * distinct de AddMemberDialog (flux admin, resté sur les mocks). Un seul
 * appel réseau écrivain dans tout le parcours : POST /auth/inscription à la
 * toute fin.
 *
 * Recensement de parenté, volontairement simplifié : ce formulaire établit
 * uniquement PÈRE → MÈRE → VOUS. La fratrie, les conjoint(e)s et les enfants
 * ne sont plus demandés ici (ils s'ajoutent depuis l'espace personnel, une
 * fois connecté·e) — le payload envoyé à `/auth/inscription` ne porte donc
 * plus jamais `fratrie`/`unions`/`enfantsAutres`, mais le contrat de
 * l'endpoint reste inchangé (ces champs restent optionnels côté backend).
 *
 * Le père est résolu par exactement une de deux voies convergentes
 * (matricule ou recherche par nom, ou création de sa fiche minimale) avant
 * que quoi que ce soit d'autre ne soit demandé ; une fois résolu, la mère
 * est demandée à son tour (recherche ou fiche minimale), puis l'identité de
 * la personne qui s'inscrit, puis le récapitulatif.
 */
export function NewMemberDialog({
  open,
  onOpenChange,
  onCreated,
  seConnecterApresCreation = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé après une inscription réussie, une fois l'écran d'identifiants
   * fermé — utilisé par l'onglet Habitants pour rafraîchir sa liste. */
  onCreated?: () => void;
  /** `true` (défaut) pour l'auto-inscription depuis l'écran de connexion :
   * connecte immédiatement la personne créée et redirige vers l'accueil —
   * comportement inchangé. `false` pour un·e opérateur·rice déjà connecté·e
   * qui ajoute un habitant depuis l'onglet Habitants : sa propre session ne
   * doit surtout pas être remplacée par celle de la fiche qu'il ou elle
   * vient de créer. */
  seConnecterApresCreation?: boolean;
}) {
  const navigate = useNavigate();
  const loginWithToken = useAuthStore((s) => s.loginWithToken);

  // --- Résolution du père --------------------------------------------------
  const [pereConnuMatricule, setPereConnuMatricule] = useState<"oui" | "non" | null>(null);
  const [matriculeSaisi, setMatriculeSaisi] = useState("");
  const [matriculeRecherche, setMatriculeRecherche] = useState(false);
  const [matriculeErreur, setMatriculeErreur] = useState("");
  const [matriculeResultat, setMatriculeResultat] = useState<ApiPersonneResume | null>(null);
  const [creationPere, setCreationPere] = useState(false);
  // false tant qu'aucune correspondance n'est affichée dans le picker (que ce
  // soit faute d'avoir cherché, ou parce que la recherche n'a rien trouvé) —
  // pilote l'affichage du message + bouton de création : visible par défaut
  // (comme la recherche elle-même), mais jamais en même temps qu'une liste de
  // résultats à choisir.
  const [pereADesCorrespondances, setPereADesCorrespondances] = useState(false);

  // Père/mère résolus — convergence des voies (matricule / recherche / création).
  const [pere, setPere] = useState<PersonRef | null>(null);
  const [mere, setMere] = useState<PersonRef | null>(null);
  const [pereFamilleId, setPereFamilleId] = useState<number | null>(null);

  // Famille — uniquement nécessaire si le père est créé de toutes pièces
  // (un père déjà existant connaît déjà sa vraie famille). S'il est créé de
  // toutes pièces, une nouvelle famille est fondée automatiquement à son nom
  // (voir handleSubmit) — jamais demandée à l'utilisateur.
  const [pereBrouillon, setPereBrouillon] = useState<NouvellePersonneForm>(emptyNouvellePersonne("homme"));
  const [mereBrouillon, setMereBrouillon] = useState<NouvellePersonneForm>(emptyNouvellePersonne("femme"));
  const [creationMere, setCreationMere] = useState(false);

  // Suggestions tirées des relations déjà connues du père sélectionné
  // (existant uniquement — un père nouveau n'a par construction encore rien
  // en base).
  const [pereConjointes, setPereConjointes] = useState<ApiPersonneResume[]>([]);

  // --- Identité ---------------------------------------------------------------
  const [identite, setIdentite] = useState(emptyIdentite);
  const setId = <K extends keyof typeof emptyIdentite>(key: K, value: (typeof emptyIdentite)[K]) => {
    setIdentite((f) => ({ ...f, [key]: value }));
    clearError(key);
  };

  // --- État transverse ---------------------------------------------------------
  const [currentStepId, setCurrentStepId] = useState<StepId>("matricule-connu");
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Retire le message d'erreur d'un champ dès que sa cause est résolue —
   * sans ça, un message d'erreur resterait affiché à côté d'une confirmation
   * de succès jusqu'au prochain clic sur « Suivant ». */
  function clearError(field: string) {
    setErrors((e) => {
      if (!(field in e)) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  }
  function toneFor(field: string): "info" | "error" {
    const msg = errors[field];
    return msg && estMessageInfo(field) ? "info" : "error";
  }
  function errorClassName(field: string): string {
    return toneFor(field) === "info" ? "text-info" : "text-destructive";
  }
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [forcerCreation, setForcerCreation] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    token: string;
    refreshToken: string;
    utilisateur: AuthUtilisateur;
    nom: string;
    prenom: string;
    comptes: CompteAffiche[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentStepId("matricule-connu");
    setPereConnuMatricule(null);
    setMatriculeSaisi("");
    setMatriculeRecherche(false);
    setMatriculeErreur("");
    setMatriculeResultat(null);
    setCreationPere(false);
    setPereADesCorrespondances(false);
    setPere(null);
    setMere(null);
    setPereFamilleId(null);
    setPereBrouillon(emptyNouvellePersonne("homme"));
    setMereBrouillon(emptyNouvellePersonne("femme"));
    setCreationMere(false);
    setPereConjointes([]);
    setIdentite(emptyIdentite);
    setErrors({});
    setServerError("");
    setForcerCreation(false);
  }, [open]);

  // Père existant résolu (matricule ou recherche) : exploite ses relations
  // déjà connues — conjointes proposées en SUGGESTION, jamais appliquée
  // automatiquement. Un père "nouveau" n'a par construction rien à suggérer.
  useEffect(() => {
    if (pere?.mode !== "existant") {
      setPereConjointes([]);
      return;
    }
    apiRequest<ConjointsResponse>(`/personnes/${pere.uuid}/conjoints`)
      .then((res) => setPereConjointes(res.conjoints))
      .catch(() => setPereConjointes([]));
  }, [pere]);

  // Une fois le père connu (créé ou sélectionné), le membre porte son nom de
  // famille — seule la mère peut porter un nom différent.
  const pereNom = pere?.mode === "existant" ? pere.nom : pere?.mode === "nouveau" ? pere.donnees.nom.trim() : "";
  useEffect(() => {
    if (pereNom) setId("nom", pereNom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pereNom]);

  /** Changer de réponse sur le père invalide toute résolution de la mère déjà
   * faite (elle dépend du père connu) — sans ce nettoyage, revenir en arrière
   * et changer d'avis laisserait une `mere` périmée satisfaire silencieusement
   * la validation de l'étape qu'on vient de rendre visible. */
  function reinitialiserMere() {
    setMere(null);
    setCreationMere(false);
    setMereBrouillon(emptyNouvellePersonne("femme"));
  }

  function choisirPereConnuMatricule(valeur: "oui" | "non") {
    if (valeur === pereConnuMatricule) return;
    clearError("pereConnuMatricule");
    setPereConnuMatricule(valeur);
    setPere(null);
    setPereFamilleId(null);
    setCreationPere(false);
    setPereADesCorrespondances(false);
    setMatriculeSaisi("");
    setMatriculeResultat(null);
    setMatriculeErreur("");
    reinitialiserMere();
  }

  // Recherche automatique par matricule — débattue (300ms) pendant la frappe,
  // pas de bouton à cliquer. Le résultat/l'erreur précédents sont effacés
  // immédiatement à chaque frappe, seul l'appel réseau lui-même est différé.
  useEffect(() => {
    const valeur = matriculeSaisi.trim();
    setMatriculeErreur("");
    setMatriculeResultat(null);
    if (!valeur) {
      setMatriculeRecherche(false);
      return;
    }
    setMatriculeRecherche(true);
    const handle = setTimeout(() => {
      apiRequest<PersonnesResponse>(`/personnes?matricule=${encodeURIComponent(valeur)}&pageSize=5`)
        .then((res) => {
          if (res.personnes.length === 0) {
            setMatriculeErreur("Aucune personne ne correspond à ce matricule. Vérifiez-le, ou recherchez par nom.");
          } else {
            setMatriculeResultat(res.personnes[0]);
          }
        })
        .catch(() => setMatriculeErreur("La recherche a échoué. Réessayez."))
        .finally(() => setMatriculeRecherche(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matriculeSaisi]);

  function confirmerPereMatricule() {
    if (!matriculeResultat) return;
    clearError("matricule");
    setPere({ mode: "existant", ...matriculeResultat });
    setPereFamilleId(matriculeResultat.familleId ?? null);
    reinitialiserMere();
  }

  /** Annule la confirmation du père trouvé par matricule — la fiche reste
   * affichée (on ne relance pas la recherche), mais elle n'est plus utilisée
   * pour continuer ; la mère, qui en dépend, est réinitialisée. */
  function annulerPereMatricule() {
    setPere(null);
    setPereFamilleId(null);
    reinitialiserMere();
  }

  function selectionnerPereRecherche(ref: PersonRef | null) {
    if (ref) clearError("pere");
    setPere(ref);
    reinitialiserMere();
    if (ref?.mode === "existant") {
      setPereFamilleId(ref.familleId ?? null);
      setCreationPere(false);
      setPereADesCorrespondances(true);
    } else {
      setPereFamilleId(null);
    }
  }

  function selectionnerMereRecherche(ref: PersonRef | null) {
    if (ref) clearError("mere");
    setMere(ref);
  }

  function updatePereBrouillon(v: NouvellePersonneForm) {
    setPereBrouillon(v);
    clearError("pere");
  }

  function updateMereBrouillon(v: NouvellePersonneForm) {
    setMereBrouillon(v);
    clearError("mere");
  }

  /** Déclenché par le bouton affiché une fois la recherche du père infructueuse
   * — bascule directement sur l'étape de création (père + mère ensemble),
   * sans repasser par « Suivant ». */
  function creerFicheParents() {
    setCreationPere(true);
    setPere(null);
    reinitialiserMere();
    setErrors({});
    setCurrentStepId("creation-pere");
  }

  function validerCreationPere() {
    setPere({ mode: "nouveau", donnees: pereBrouillon });
  }

  // ---------------------------------------------------------------------------
  // Étapes visibles — recalculées à chaque rendu à partir de l'état actuel.
  // C'est ce tableau, et lui seul, qui pilote compteur + navigation.
  // ---------------------------------------------------------------------------
  function isStepVisible(id: StepId): boolean {
    switch (id) {
      case "matricule-connu":
        return true;
      case "matricule-saisie":
        return pereConnuMatricule === "oui";
      case "recherche-pere":
        return pereConnuMatricule === "non";
      case "creation-pere":
        return pereConnuMatricule === "non" && creationPere;
      case "mere":
        // Sautée quand père et mère sont créés ensemble à l'étape
        // précédente (`creation-pere`) — la mère y est déjà résolue.
        return pere !== null && !creationPere;
      case "identite":
        return pere !== null && mere !== null;
      case "recap":
        return pere !== null && mere !== null;
    }
  }

  const visibleSteps = useMemo(
    () => STEP_ORDER.filter(isStepVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pereConnuMatricule, creationPere, pere, mere],
  );
  const currentIndex = visibleSteps.indexOf(currentStepId);

  // Une réponse antérieure change et fait disparaître l'étape courante : on
  // revient à la dernière étape encore valide plutôt que de rester sur un
  // état incohérent.
  useEffect(() => {
    if (currentIndex !== -1) return;
    const masterIdx = STEP_ORDER.indexOf(currentStepId);
    const precedente = [...STEP_ORDER].slice(0, masterIdx).reverse().find((id) => visibleSteps.includes(id));
    setCurrentStepId(precedente ?? visibleSteps[0] ?? "matricule-connu");
  }, [visibleSteps, currentStepId, currentIndex]);

  // ---------------------------------------------------------------------------
  // Validation par étape — chaque étape sait si l'on peut avancer, et effectue
  // au passage la seule "finalisation" dont elle a la responsabilité (ex. la
  // création du père/de la mère ne devient réelle qu'en avançant).
  // ---------------------------------------------------------------------------
  function validateCurrentStep(): boolean {
    // Efface le bandeau rouge d'une éventuelle tentative de soumission
    // précédente — sans ça, il restait affiché indéfiniment au-dessus des
    // messages par-champ fraîchement recalculés ci-dessous, dès qu'on
    // retentait « Suivant » depuis l'étape où le serveur avait renvoyé.
    setServerError("");
    const next: Record<string, string> = {};
    switch (currentStepId) {
      case "matricule-connu":
        if (!pereConnuMatricule) next.pereConnuMatricule = "Choisissez une réponse.";
        break;
      case "matricule-saisie":
        if (!pere) next.matricule = "Confirmez d'abord qu'il s'agit bien de votre père.";
        break;
      case "recherche-pere":
        if (!pere && !creationPere) next.pere = "Sélectionnez votre père.";
        break;
      case "creation-pere":
        if (!pereBrouillon.prenom.trim() || !pereBrouillon.nom.trim()) next.pere = "Le prénom et le nom du père sont requis.";
        if (!mereBrouillon.prenom.trim() || !mereBrouillon.nom.trim()) next.mere = "Le prénom et le nom de la mère sont requis.";
        if (Object.keys(next).length === 0) {
          validerCreationPere();
          setMere({ mode: "nouveau", donnees: mereBrouillon });
        }
        break;
      case "mere":
        if (creationMere) {
          if (!mereBrouillon.prenom.trim() || !mereBrouillon.nom.trim()) {
            next.mere = "Le prénom et le nom de la mère sont requis.";
          } else {
            setMere({ mode: "nouveau", donnees: mereBrouillon });
          }
        } else if (!mere) {
          next.mere = "Sélectionnez votre mère.";
        }
        break;
      case "identite": {
        const errPrenom = identiteFieldError("prenom", identite);
        if (errPrenom) next.prenom = errPrenom;
        const errNom = identiteFieldError("nom", identite);
        if (errNom) next.nom = errNom;
        const errEmail = identiteFieldError("email", identite);
        if (errEmail) next.email = errEmail;
        const errTelephone = identiteFieldError("telephone", identite);
        if (errTelephone) next.telephone = errTelephone;
        break;
      }
      default:
        break;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Ordre de priorité par étape — le premier champ effectivement en
      // erreur reçoit le focus, jamais un champ choisi arbitrairement.
      const order =
        currentStepId === "identite"
          ? ["prenom", "nom", "email", "telephone"]
          : Object.keys(next);
      focusFirstError(next, order, (field) => focusIdForStep(currentStepId, field) ?? field);
    }
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setErrors({});
    // "creation-pere" (père+mère créés ensemble) et "mere" en mode création
    // viennent de fixer `pere`/`mere` comme simple EFFET DE BORD de l'appel
    // ci-dessus — cette mise à jour d'état n'a pas encore déclenché de
    // nouveau rendu, donc `visibleSteps` plus bas reste celui d'AVANT ce
    // clic (qui ne comptait pas encore "identite"/"recap", faute de
    // pere/mere connus). S'appuyer dessus ferait sauter tout droit à la
    // création du compte. Dans ces deux cas précis, l'étape suivante est de
    // toute façon toujours "identite" (voir STEP_ORDER) : on y va
    // directement plutôt que de se fier à cet instantané périmé.
    if (currentStepId === "creation-pere" || (currentStepId === "mere" && creationMere)) {
      setCurrentStepId("identite");
      return;
    }
    const idx = visibleSteps.indexOf(currentStepId);
    if (idx < visibleSteps.length - 1) setCurrentStepId(visibleSteps[idx + 1]);
  }

  function goBack() {
    setErrors({});
    setServerError("");
    const idx = visibleSteps.indexOf(currentStepId);
    if (idx > 0) setCurrentStepId(visibleSteps[idx - 1]);
  }

  function stepForField(field: string | undefined): StepId | null {
    if (!field) return null;
    if (field === "familleId") return "creation-pere";
    if (field === "pere") {
      if (pereConnuMatricule === "oui") return "matricule-saisie";
      return creationPere ? "creation-pere" : "recherche-pere";
    }
    if (field === "mere") return "mere";
    if (["email", "telephone", "prenom", "nom", "dateNaissance", "lieuNaissance", "profession", "sexe"].includes(field)) {
      return "identite";
    }
    return null;
  }

  function buildPayload(
    familleInfo: { familleId: number } | { nouvelleFamille: { nom: string } },
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      prenom: identite.prenom.trim(),
      nom: identite.nom.trim(),
      sexe: identite.sexe,
      estAuVillage: identite.estAuVillage,
      estEnGuinee: identite.estEnGuinee,
      ...familleInfo,
    };
    if (identite.email.trim()) body.email = identite.email.trim();
    if (identite.photo.trim()) body.photo = identite.photo.trim();
    if (identite.telephone.trim()) body.telephone = identite.telephone.trim();
    if (identite.dateNaissance) body.dateNaissance = identite.dateNaissance;
    if (pere) body.pere = toPayloadRef(pere);
    if (mere) body.mere = toPayloadRef(mere);
    if (forcerCreation) body.forcerCreation = true;
    return body;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateCurrentStep()) return;
    setServerError("");
    setSaving(true);
    try {
      // Un père existant connaît déjà sa vraie famille (pereFamilleId). Un
      // père créé de toutes pièces fonde automatiquement la sienne, à son
      // propre nom — jamais choisie manuellement dans ce formulaire, et
      // créée côté backend dans la même transaction que l'inscription (voir
      // auth.service.ts::inscrire), jamais via POST /familles (réservé aux
      // admins, inaccessible à un·e inscrit·e anonyme).
      const familleInfo = creationPere
        ? { nouvelleFamille: { nom: pereBrouillon.nom.trim() } }
        : { familleId: pereFamilleId as number };

      const res = await apiRequest<InscriptionResponse>("/auth/inscription", {
        method: "POST",
        body: buildPayload(familleInfo),
      });

      setPendingLogin({
        token: res.token,
        refreshToken: res.refreshToken,
        utilisateur: res.utilisateur,
        nom: res.personne.nom,
        prenom: res.personne.prenom,
        comptes: buildComptesCrees(res),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const invalides = champsInvalides(err);
        if (invalides.length > 0) {
          // On navigue vers l'étape concernée et on explique le problème via
          // le bandeau — mais sans pré-remplir `errors` : le message rouge/bleu
          // sous un champ ne doit apparaître qu'au moment où l'utilisateur
          // retente réellement de valider cette étape (clic sur « Suivant »),
          // jamais dès l'arrivée sur l'écran.
          const cible = stepForField(invalides[0]!.field);
          if (cible) setCurrentStepId(cible);
          setServerError(messageChampsInvalides(err) ?? err.message);
          return;
        }

        const details = err.details as { field?: string; doublons?: unknown[] } | undefined;
        const cible = stepForField(details?.field);
        if (cible) setCurrentStepId(cible);

        if (err.status === 409 && Array.isArray(details?.doublons)) {
          setServerError(
            `${err.message} Cliquez à nouveau sur « Créer mon compte » pour confirmer malgré tout.`,
          );
          setForcerCreation(true);
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("Impossible de créer le compte pour le moment. Réessayez.");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCredentialsContinue() {
    if (!pendingLogin) return;
    if (seConnecterApresCreation) {
      loginWithToken(
        pendingLogin.token,
        pendingLogin.refreshToken,
        pendingLogin.utilisateur,
        pendingLogin.nom,
        pendingLogin.prenom,
      );
    }
    setPendingLogin(null);
    onOpenChange(false);
    onCreated?.();
    if (seConnecterApresCreation) navigate("/", { replace: true });
  }

  if (pendingLogin) {
    return <CredentialsDialog open comptes={pendingLogin.comptes} onContinue={handleCredentialsContinue} />;
  }

  const meta = STEP_META[currentStepId];
  const isFirstVisible = currentIndex <= 0;
  // Volontairement PAS `currentIndex === visibleSteps.length - 1` : ce calcul
  // dépend de `pere`/`mere`, qui — sur "creation-pere"/"mere" — ne sont fixés
  // qu'au clic sur "Suivant" (voir goNext ci-dessus), un instant après ce
  // rendu-ci. S'y fier ferait apparaître "Créer mon compte" un cran trop tôt,
  // sautant l'identité ET le récapitulatif. "recap" reste la seule vraie
  // dernière étape : le bouton de création n'apparaît que là, jamais avant.
  const isLastVisible = currentStepId === "recap";

  // Pressing Enter in a text field natively submits the enclosing <form>
  // even though "Suivant" is a plain type="button" — without this, Entrée
  // skips straight to handleSubmit() (a real POST /auth/inscription) from
  // whatever intermediate step is current, bypassing goNext()'s step-by-step
  // validation entirely. Enter now advances one step at a time instead,
  // exactly like clicking "Suivant" — only the true last step still submits.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement || isLastVisible) return;
    e.preventDefault();
    goNext();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Nouveau membre Étape {currentIndex + 1}/{visibleSteps.length} · {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate className="space-y-4">
          {currentStepId === "matricule-connu" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Connaissez-vous le numéro matricule de votre père ?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={pereConnuMatricule === "oui" ? "default" : "outline"}
                  onClick={() => choisirPereConnuMatricule("oui")}
                >
                  Oui, je connais son matricule
                </Button>
                <Button
                  type="button"
                  variant={pereConnuMatricule === "non" ? "default" : "outline"}
                  onClick={() => choisirPereConnuMatricule("non")}
                >
                  Non, je ne le connais pas
                </Button>
              </div>
              {errors.pereConnuMatricule && (
                <p className={cn("text-xs", errorClassName("pereConnuMatricule"))}>{errors.pereConnuMatricule}</p>
              )}
            </div>
          )}

          {currentStepId === "matricule-saisie" && (
            <div className="space-y-4">
              <Field id="matricule-input" label="Matricule du père" required error={errors.matricule} errorTone={toneFor("matricule")}>
                <Input
                  id="matricule-input"
                  value={matriculeSaisi}
                  onChange={(e) => {
                    setMatriculeSaisi(e.target.value);
                    clearError("matricule");
                  }}
                  placeholder="Ex. MSD-000042"
                />
              </Field>
              {matriculeRecherche && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Search className="size-3.5" /> Recherche…
                </p>
              )}
              {matriculeErreur && <p className="text-sm text-destructive">{matriculeErreur}</p>}
              {matriculeResultat && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Père trouvé</p>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      {matriculeResultat.photo && <AvatarImage src={matriculeResultat.photo} alt="" />}
                      <AvatarFallback className="text-xs">
                        {initiales(matriculeResultat.prenom, matriculeResultat.nom)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm text-foreground">
                        {matriculeResultat.prenom} {matriculeResultat.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">Matricule : {matriculeResultat.matricule}</p>
                    </div>
                  </div>
                  {pere?.mode === "existant" && pere.id === matriculeResultat.id ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                        <Check className="size-3.5" /> Personne utilisée pour continuer
                      </p>
                      <Button type="button" variant="ghost" size="sm" onClick={annulerPereMatricule}>
                        <X className="size-4" />
                        Désactiver
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" size="sm" onClick={confirmerPereMatricule}>
                      <Check className="size-4" />
                      Utiliser cette personne
                    </Button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => choisirPereConnuMatricule("non")}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                Rechercher plutôt par nom
              </button>
            </div>
          )}

          {currentStepId === "recherche-pere" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Recherchons votre père dans le registre du village.</p>
              <Field id="recherche-pere-picker" label="Votre père" error={errors.pere} errorTone={toneFor("pere")}>
                <PereSearchModal
                  value={pere}
                  onChange={selectionnerPereRecherche}
                  onHasCandidates={setPereADesCorrespondances}
                />
              </Field>
              {pere?.mode === "existant" && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="size-4" /> Père sélectionné : {personRefLabel(pere)}
                  {pere.matricule ? ` ${pere.matricule}` : ""}
                  <button
                    type="button"
                    onClick={() => selectionnerPereRecherche(null)}
                    className="ml-1 text-xs font-normal text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                  >
                    Changer
                  </button>
                </p>
              )}
              {!pere && !pereADesCorrespondances && (
                <>
                  <Separator />
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                    <p className="text-sm text-muted-foreground">Votre père n'a pas été trouvé dans le registre.</p>
                    <Button type="button" size="sm" onClick={creerFicheParents}>
                      <UserPlus className="size-4" />
                      Créer la fiche de mes parents
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {currentStepId === "creation-pere" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Votre père</p>
                  {errors.pere && <p className={cn("text-xs", errorClassName("pere"))}>{errors.pere}</p>}
                  <FicheMinimale idPrefix="pere-creation" value={pereBrouillon} onChange={updatePereBrouillon} />
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Votre mère</p>
                  {errors.mere && <p className={cn("text-xs", errorClassName("mere"))}>{errors.mere}</p>}
                  <FicheMinimale idPrefix="mere-creation" value={mereBrouillon} onChange={updateMereBrouillon} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ces fiches seront créées en même temps que votre inscription, avec leurs propres matricules générés
                automatiquement une nouvelle famille sera fondée au nom du père.
              </p>
            </div>
          )}

          {currentStepId === "mere" && pere && (
            <div className="space-y-4">
              {!creationMere ? (
                <>
                  <Field id="mere-picker" label="Votre mère" error={errors.mere} errorTone={toneFor("mere")}>
                    {pereConjointes.length > 0 ? (
                      <ConjointesSuggestions
                        pereLabel={personRefLabel(pere)}
                        conjointes={pereConjointes}
                        value={mere}
                        onSelect={(c) => selectionnerMereRecherche(c ? { mode: "existant", ...c } : null)}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Aucune épouse connue de {personRefLabel(pere)} dans le registre créez la fiche de la mère
                        ci-dessous.
                      </p>
                    )}
                  </Field>
                  {mere?.mode === "existant" && (
                    <p className="flex items-center gap-1.5 text-sm text-success">
                      <Check className="size-4" /> Mère sélectionnée : {personRefLabel(mere)}
                      <button
                        type="button"
                        onClick={() => selectionnerMereRecherche(null)}
                        className="ml-1 text-xs font-normal text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                      >
                        Désactiver
                      </button>
                    </p>
                  )}
                  <Separator />
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                    <p className="text-sm text-muted-foreground">Votre mère n'a pas été trouvée dans le registre ?</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCreationMere(true);
                        setMere(null);
                      }}
                    >
                      <UserPlus className="size-4" />
                      Créer sa fiche
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {errors.mere && <p className={cn("text-xs", errorClassName("mere"))}>{errors.mere}</p>}
                  <FicheMinimale idPrefix="mere-creation" value={mereBrouillon} onChange={updateMereBrouillon} />
                  <p className="text-xs text-muted-foreground">
                    La mère peut appartenir à une autre lignée son nom n'est jamais remplacé par celui du père.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMere(false);
                      setMereBrouillon(emptyNouvellePersonne("femme"));
                    }}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                  >
                    Rechercher plutôt dans le registre
                  </button>
                </>
              )}
            </div>
          )}

          {currentStepId === "identite" && (
            <div className="space-y-4">
              <ProfilePhotoField
                value={identite.photo}
                onChange={(url) => setId("photo", url)}
                prenom={identite.prenom}
                nom={identite.nom}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="new-prenom"
                  label="Prénom"
                  required
                  error={errors.prenom}
                  errorTone={toneFor("prenom")}
                  className={pereNom ? "sm:col-span-2" : undefined}
                >
                  <Input id="new-prenom" value={identite.prenom} onChange={(e) => setId("prenom", e.target.value)} />
                </Field>
                {/* Masqué quand le nom est hérité du père (cas normal à cette
                 * étape, voir l'effet sur `pereNom` plus haut) — le champ
                 * était affiché désactivé auparavant, ce qui n'apportait
                 * rien : `identite.nom` reste renseigné en arrière-plan. */}
                {!pereNom && (
                  <Field id="new-nom" label="Nom" required error={errors.nom} errorTone={toneFor("nom")}>
                    <Input
                      id="new-nom"
                      value={identite.nom}
                      onChange={(e) => setId("nom", versMajusculesSansAccent(e.target.value))}
                    />
                  </Field>
                )}
                <Field id="new-sexe" label="Sexe" required>
                  <Select value={identite.sexe} onValueChange={(v) => setId("sexe", v as "homme" | "femme")}>
                    <SelectTrigger id="new-sexe">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="homme">Homme</SelectItem>
                      <SelectItem value="femme">Femme</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field id="new-email" label="E-mail" error={errors.email} errorTone={toneFor("email")}>
                  <Input
                    id="new-email"
                    type="email"
                    value={identite.email}
                    onChange={(e) => setId("email", e.target.value)}
                    placeholder="vous@moussidalheire.gn"
                  />
                </Field>
                <Field id="new-telephone" label="Téléphone" error={errors.telephone} errorTone={toneFor("telephone")}>
                  <PhoneInput
                    id="new-telephone"
                    value={identite.telephone}
                    onValueChange={(v) => setId("telephone", v)}
                  />
                </Field>
                <Field id="new-dateNaissance" label="Date de naissance">
                  <Input
                    id="new-dateNaissance"
                    type="date"
                    value={identite.dateNaissance}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setId("dateNaissance", e.target.value)}
                  />
                </Field>
                <GeographicSituationFields
                  idPrefix="new"
                  estDecede={false}
                  estAuVillage={identite.estAuVillage}
                  estEnGuinee={identite.estEnGuinee}
                  onChange={(next) =>
                    setIdentite((f) => ({ ...f, estAuVillage: next.estAuVillage, estEnGuinee: next.estEnGuinee }))
                  }
                />
              </div>
            </div>
          )}

          {currentStepId === "recap" && (
            <div className="space-y-4 text-sm">
              <section>
                <p className="font-medium">Identité</p>
                <p className="text-muted-foreground">
                  {identite.prenom} {identite.nom} · {identite.sexe === "homme" ? "Homme" : "Femme"}
                  {identite.email.trim() ? ` · ${identite.email.trim()}` : ""}
                </p>
              </section>
              <section>
                <p className="font-medium">Filiation</p>
                <p className="text-muted-foreground">Père : {pere ? personRefLabel(pere) : "non renseigné"}</p>
                <p className="text-muted-foreground">Mère : {mere ? personRefLabel(mere) : "non renseignée"}</p>
                {creationPere && pereBrouillon.nom.trim() && (
                  <p className="text-muted-foreground">Nouvelle famille fondée : {pereBrouillon.nom.trim()}</p>
                )}
              </section>
              <p className="text-xs text-muted-foreground">
                Vous pourrez ajouter votre conjoint·e et vos enfants plus tard, depuis votre espace personnel.
              </p>
            </div>
          )}

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => (isFirstVisible ? onOpenChange(false) : goBack())}>
              <ChevronLeft className="size-4" />
              {isFirstVisible ? "Annuler" : "Précédent"}
            </Button>
            {!isLastVisible ? (
              // `key` distinct du bouton "Créer mon compte" ci-dessous —
              // sans ça, React réutilise le MÊME nœud DOM en lui changeant
              // seulement son `type` ("button" -> "submit") au clic qui fait
              // passer de "identite" à "recap" (dernière étape) : le
              // navigateur évalue alors l'action par défaut du clic sur le
              // DOM déjà mis à jour et soumet le formulaire aussitôt, avant
              // même que le récapitulatif ne s'affiche. Un `key` différent
              // force un vrai démontage/remontage, donc plus aucun clic
              // "Suivant" ne peut se retrouver, a posteriori, traité comme un
              // clic sur un bouton `type="submit"`.
              <Button key="suivant" type="button" onClick={goNext}>
                Suivant
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button key="creer-compte" type="submit" disabled={saving}>
                <UserPlus />
                {saving ? "Création…" : "Créer mon compte"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
