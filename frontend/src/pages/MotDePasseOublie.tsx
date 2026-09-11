import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ForceMotDePasse } from "@/components/auth/ForceMotDePasse";
import { ApiError } from "@/lib/api-client";
import { respecteLaPolitique } from "@/lib/mot-de-passe";
import {
  demanderCodeReinitialisation,
  reinitialiserMotDePasse,
  verifierCodeReinitialisation,
} from "@/services/api/auth";
import { useAuthStore } from "@/store/useAuthStore";
import logo from "@/assets/logo.jpeg";

/** Doivent correspondre au backend (password-reset.service.ts). */
const DUREE_VALIDITE_MS = 15 * 60 * 1000;
const DELAI_RENVOI_MS = 60 * 1000;
const TENTATIVES_MAX = 5;
const LONGUEUR_CODE = 6;

/**
 * L'étape en cours survit à un rechargement de page : un utilisateur qui
 * rafraîchit l'écran de saisie du code ne doit pas redemander un code — ce
 * qui invaliderait celui qu'il vient de recevoir. `sessionStorage` et non
 * `localStorage` : l'état disparaît avec l'onglet.
 */
const CLE_SESSION = "moussidalheire-reinitialisation";

interface EtatSauvegarde {
  identifiant: string;
  envoyeA: number | null;
}

function lireSauvegarde(): EtatSauvegarde | null {
  try {
    const brut = sessionStorage.getItem(CLE_SESSION);
    if (!brut) return null;
    const valeur = JSON.parse(brut) as Partial<EtatSauvegarde>;
    if (typeof valeur.identifiant !== "string" || !valeur.identifiant) return null;
    return {
      identifiant: valeur.identifiant,
      envoyeA: typeof valeur.envoyeA === "number" ? valeur.envoyeA : null,
    };
  } catch {
    return null;
  }
}

function sauvegarder(etat: EtatSauvegarde | null): void {
  try {
    if (etat) sessionStorage.setItem(CLE_SESSION, JSON.stringify(etat));
    else sessionStorage.removeItem(CLE_SESSION);
  } catch {
    // Stockage indisponible : l'étape sera simplement perdue au rechargement.
  }
}

function messageErreur(err: unknown, parDefaut: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    return err.message || parDefaut;
  }
  return parDefaut;
}

function formaterDuree(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Majuscules, sans espaces ni tirets, six caractères au plus. */
function nettoyerCode(saisie: string): string {
  return saisie.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LONGUEUR_CODE);
}

type Etape = "identifiant" | "code";

export default function MotDePasseOublie() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const logout = useAuthStore((s) => s.logout);

  const [sauvegardeInitiale] = useState(lireSauvegarde);

  // Étape de départ : état sauvegardé (rechargement), sinon lien de l'e-mail
  // (`?etape=code`), sinon première étape.
  const [etape, setEtape] = useState<Etape>(() =>
    sauvegardeInitiale || params.get("etape") === "code" ? "code" : "identifiant",
  );
  const [identifiant, setIdentifiant] = useState(
    () =>
      sauvegardeInitiale?.identifiant ??
      (location.state as { identifiant?: string } | null)?.identifiant ??
      "",
  );
  // Inconnu quand on arrive par le lien de l'e-mail : le compte à rebours est
  // alors remplacé par une mention statique.
  const [envoyeA, setEnvoyeA] = useState<number | null>(sauvegardeInitiale?.envoyeA ?? null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [jeton, setJeton] = useState<string | null>(null);

  // L'identifiant n'est affiché en lecture seule que s'il a été saisi ici,
  // avant l'envoi. Arrivé par le lien de l'e-mail, il faut le demander.
  const identifiantConnu = etape === "code" && envoyeA !== null && identifiant.trim() !== "";

  useEffect(() => {
    if (etape !== "code" || envoyeA === null) return;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [etape, envoyeA]);

  useEffect(() => {
    if (etape === "code" && identifiant.trim()) sauvegarder({ identifiant, envoyeA });
  }, [etape, identifiant, envoyeA]);

  const restantMs = envoyeA === null ? null : envoyeA + DUREE_VALIDITE_MS - maintenant;
  const expire = restantMs !== null && restantMs <= 0;
  const renvoiDansMs = envoyeA === null ? 0 : envoyeA + DELAI_RENVOI_MS - maintenant;
  const peutRenvoyer = renvoiDansMs <= 0 && !enCours && identifiant.trim() !== "";

  async function envoyerCode(renvoi: boolean) {
    setErreur("");
    setInfo("");
    setEnCours(true);
    try {
      await demanderCodeReinitialisation(identifiant.trim());
      const instant = Date.now();
      setEnvoyeA(instant);
      setMaintenant(instant);
      setCode("");
      setEtape("code");
      if (renvoi) setInfo("Un nouveau code vous a été envoyé. Le précédent n'est plus valable.");
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'envoyer le code pour le moment. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  async function soumettreIdentifiant(e: FormEvent) {
    e.preventDefault();
    if (!identifiant.trim()) {
      setErreur("Veuillez renseigner votre identifiant.");
      return;
    }
    await envoyerCode(false);
  }

  async function soumettreCode(e: FormEvent) {
    e.preventDefault();
    if (!identifiant.trim()) {
      setErreur("Veuillez renseigner votre identifiant.");
      return;
    }
    if (code.length !== LONGUEUR_CODE) {
      setErreur(`Le code comporte ${LONGUEUR_CODE} caractères.`);
      return;
    }
    setErreur("");
    setInfo("");
    setEnCours(true);
    try {
      setJeton(await verifierCodeReinitialisation(identifiant.trim(), code));
    } catch (err) {
      setErreur(messageErreur(err, "Code invalide ou expiré."));
    } finally {
      setEnCours(false);
    }
  }

  function recommencer() {
    sauvegarder(null);
    setJeton(null);
    setEtape("identifiant");
    setCode("");
    setEnvoyeA(null);
    setErreur("");
    setInfo("");
  }

  async function surReinitialisation() {
    sauvegarder(null);
    // Une éventuelle session locale appartient à une époque révolue : le
    // serveur l'a révoquée. On l'efface pour que la page de connexion ne
    // tente pas de la réutiliser.
    await logout();
    navigate("/connexion", {
      replace: true,
      state: {
        messageSucces:
          "Votre mot de passe a été réinitialisé. Toutes vos sessions ont été fermées : connectez-vous avec votre nouveau mot de passe.",
      },
    });
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="" aria-hidden="true" className="size-14 rounded-full object-cover ring-2 ring-primary/30" />
          <div className="space-y-1">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              {etape === "identifiant" ? <KeyRound className="size-3.5" /> : <Mail className="size-3.5" />}
              Mot de passe oublié
            </p>
            <h1 className="font-display text-xl font-bold text-foreground">
              {etape === "identifiant" ? "Recevoir un code" : "Saisissez votre code"}
            </h1>
          </div>
        </div>

        {etape === "identifiant" ? (
          <form onSubmit={soumettreIdentifiant} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              Indiquez l'identifiant avec lequel vous vous connectez. Un code vous sera envoyé à
              l'adresse e-mail associée à votre compte.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reinit-identifiant">Identifiant, e-mail, matricule ou téléphone</Label>
              <Input
                id="reinit-identifiant"
                type="text"
                autoComplete="username"
                value={identifiant}
                onChange={(e) => {
                  setIdentifiant(e.target.value);
                  setErreur("");
                }}
                placeholder="vous@moussidalheire.gn, MSD-000001…"
                autoFocus
              />
            </div>

            {erreur && (
              <p role="alert" className="text-sm text-destructive">
                {erreur}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={enCours}>
              <Mail />
              {enCours ? "Envoi…" : "Recevoir un code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={soumettreCode} className="space-y-4" noValidate>
            {identifiantConnu ? (
              <p className="text-sm text-muted-foreground">
                Si un compte correspond à <span className="font-medium text-foreground">{identifiant}</span>,
                un code à {LONGUEUR_CODE} caractères vient d'être envoyé à l'adresse e-mail associée.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="reinit-identifiant-code">Identifiant, e-mail, matricule ou téléphone</Label>
                <Input
                  id="reinit-identifiant-code"
                  type="text"
                  autoComplete="username"
                  value={identifiant}
                  onChange={(e) => {
                    setIdentifiant(e.target.value);
                    setErreur("");
                  }}
                  placeholder="Celui qui a servi à demander le code"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="reinit-code">Code reçu par e-mail</Label>
                {restantMs !== null && (
                  <span
                    className={
                      expire ? "text-xs font-medium text-destructive" : "text-xs tabular-nums text-muted-foreground"
                    }
                    aria-live="polite"
                  >
                    {expire ? "Code expiré" : `Valable ${formaterDuree(restantMs)}`}
                  </span>
                )}
              </div>
              <Input
                id="reinit-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(e) => {
                  setCode(nettoyerCode(e.target.value));
                  setErreur("");
                }}
                placeholder="ABC234"
                className="text-center font-mono text-lg tracking-[0.4em] uppercase"
                autoFocus={identifiantConnu}
                disabled={expire}
              />
              <p className="text-xs text-muted-foreground">
                {restantMs === null
                  ? `Le code est valable 15 minutes après son envoi. `
                  : ""}
                {TENTATIVES_MAX} essais maximum : au-delà, le code est invalidé et il faut en demander un nouveau.
              </p>
            </div>

            {info && <p className="text-sm text-emerald-700 dark:text-emerald-500">{info}</p>}
            {erreur && (
              <p role="alert" className="text-sm text-destructive">
                {erreur}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={enCours || expire}>
              <ShieldCheck />
              {enCours ? "Vérification…" : "Vérifier le code"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!peutRenvoyer}
              onClick={() => void envoyerCode(true)}
            >
              <RefreshCw />
              {renvoiDansMs > 0 ? `Renvoyer un code (${formaterDuree(renvoiDansMs)})` : "Renvoyer un code"}
            </Button>

            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              Si vous ne recevez rien sous quelques minutes, vérifiez vos spams. Si votre compte n'a
              pas d'adresse e-mail enregistrée, contactez un administrateur.
            </p>

            <button
              type="button"
              onClick={recommencer}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Changer d'identifiant
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center">
          <Link
            to="/connexion"
            onClick={() => sauvegarder(null)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-3.5" />
            Retour à la connexion
          </Link>
        </div>
      </div>

      {jeton && (
        <ModaleNouveauMotDePasse
          jeton={jeton}
          onFermer={() => setJeton(null)}
          onRecommencer={recommencer}
          onSucces={surReinitialisation}
        />
      )}
    </div>
  );
}

function ModaleNouveauMotDePasse({
  jeton,
  onFermer,
  onRecommencer,
  onSucces,
}: {
  jeton: string;
  onFermer: () => void;
  onRecommencer: () => void;
  onSucces: () => Promise<void>;
}) {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [jetonInutilisable, setJetonInutilisable] = useState(false);

  const valide = respecteLaPolitique(motDePasse);
  const correspondent = confirmation.length > 0 && motDePasse === confirmation;
  const afficherEcart = confirmation.length > 0 && !correspondent;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!valide || !correspondent) return;
    setErreur("");
    setEnCours(true);
    try {
      await reinitialiserMotDePasse(jeton, motDePasse);
      await onSucces();
    } catch (err) {
      setErreur(messageErreur(err, "Impossible de réinitialiser le mot de passe pour le moment."));
      // Jeton expiré (10 minutes) ou déjà utilisé : la seule issue est de
      // reprendre la procédure. Une erreur de validation, elle, se corrige ici.
      if (err instanceof ApiError && err.status === 400 && err.code === "BAD_REQUEST") {
        setJetonInutilisable(true);
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && !enCours && onFermer()}>
      {/* Pas de fermeture au clic extérieur : un geste malencontreux ferait
          perdre les deux saisies. Échap et la croix restent disponibles. */}
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choisissez un nouveau mot de passe</DialogTitle>
          <DialogDescription>
            Il remplacera l'ancien, et toutes vos sessions ouvertes seront fermées.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={soumettre} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="nouveau-mdp">Nouveau mot de passe</Label>
            <div className="relative">
              <Input
                id="nouveau-mdp"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                value={motDePasse}
                onChange={(e) => {
                  setMotDePasse(e.target.value);
                  setErreur("");
                }}
                className="pr-10"
                autoFocus
                disabled={jetonInutilisable}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Masquer les mots de passe" : "Afficher les mots de passe"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <ForceMotDePasse motDePasse={motDePasse} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmation-mdp">Confirmez le mot de passe</Label>
            <Input
              id="confirmation-mdp"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setErreur("");
              }}
              aria-invalid={afficherEcart}
              disabled={jetonInutilisable}
            />
            {afficherEcart && (
              <p className="text-xs text-destructive">Les deux mots de passe ne correspondent pas.</p>
            )}
            {correspondent && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500">Les deux mots de passe correspondent.</p>
            )}
          </div>

          {erreur && (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          )}

          {jetonInutilisable ? (
            <Button type="button" className="w-full" onClick={onRecommencer}>
              <RefreshCw />
              Recommencer la procédure
            </Button>
          ) : (
            <Button type="submit" className="w-full" disabled={!valide || !correspondent || enCours}>
              <KeyRound />
              {enCours ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
