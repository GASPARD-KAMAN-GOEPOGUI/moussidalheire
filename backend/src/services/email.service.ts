import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { rendre } from "@/utils/templateRenderer";

export interface EmailBienvenue {
  destinataire: string;
  prenom: string;
  identifiant: string;
  motDePasse: string;
}

export interface CompteRecapitule {
  role: string;
  nomComplet: string;
  matricule: string | null;
  identifiant: string;
  motDePasseTemporaire: string;
}

export interface EmailInscriptionComplete extends EmailBienvenue {
  /** Chaque personne réellement créée pendant cette inscription (père, mère,
   * fratrie, conjoint·s, enfants) — jamais une personne existante simplement
   * rattachée. Vide la plupart du temps (le formulaire actuel ne demande
   * plus que père/mère), mais le récapitulatif reste correct si l'API est
   * un jour appelée avec fratrie/unions/enfantsAutres. */
  comptesCrees: CompteRecapitule[];
}

/** Nom affiché dans l'en-tête/pied de page de chaque e-mail — le même nom
 * que `PLATFORM_NAME` côté frontend (src/data/mock/pools.ts). Pas de variable
 * d'environnement dédiée : ce nom fait partie de l'identité du produit, pas
 * d'une configuration qui varie par environnement. */
const NOM_APPLICATION = "Moussidalheire";

/** Page d'accueil du frontend. Utilise `APP_URL` et non `CORS_ORIGIN` :
 * ce dernier est devenu une liste d'origines (dev + preview), qu'on ne peut
 * pas interpoler dans une URL. `APP_URL` retombe sur la première origine
 * autorisée quand elle n'est pas définie (voir env.ts). */
const URL_CONNEXION = `${env.APP_URL}/connexion`;

/** Logo officiel — copié depuis `moussidalheire-main/src/assets/logo.jpeg`
 * (identique, jamais redessiné), attaché à chaque e-mail et référencé via
 * `cid:` dans le HTML plutôt que par une URL publique : aucune URL stable
 * n'existe pour cet asset (bundlé par Vite avec un nom haché à chaque build
 * côté frontend), et l'intégration par CID fonctionne aussi bien en local
 * qu'en production, sans dépendre d'un serveur d'assets joignable depuis la
 * boîte mail du destinataire. */
const LOGO_CHEMIN = path.join(process.cwd(), "template", "emails", "assets", "logo.jpeg");
const LOGO_CID = "logo-moussidalheire";

const smtpConfigure = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD);

let transporteur: Transporter | null = null;
if (smtpConfigure) {
  transporteur = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
}

/** Pièce jointe partagée par tous les envois HTML de ce fichier — toujours
 * la même image, jamais chargée depuis une entrée utilisateur. */
const piecesJointesLogo = [{ filename: "logo.jpeg", path: LOGO_CHEMIN, cid: LOGO_CID }];

function anneeCourante(): string {
  return String(new Date().getFullYear());
}

/** Contenu de `auth/bienvenue.html` (identifiants d'une seule personne) —
 * partagé par `envoyerEmailBienvenue` et `envoyerEmailInscriptionComplete`
 * ci-dessous, qui ne diffèrent qu'en ceci que la seconde ajoute le
 * récapitulatif juste après (voir `rendreLayout`). */
function rendreContenuBienvenue(donnees: EmailBienvenue): string {
  return rendre("auth/bienvenue.html", {
    prenom: donnees.prenom,
    application: NOM_APPLICATION,
    identifiant: donnees.identifiant,
    mot_de_passe: donnees.motDePasse,
    action_url: URL_CONNEXION,
  });
}

/** Enveloppe un contenu déjà rendu dans `layouts/base.html` (logo, nom de
 * l'application, pied de page) — le seul endroit qui compose le document
 * final envoyé. */
function rendreLayout(content: string, apercu: string): string {
  return rendre("layouts/base.html", {
    application: NOM_APPLICATION,
    annee: anneeCourante(),
    apercu,
    logo_cid: LOGO_CID,
    content,
  });
}

/**
 * Best-effort, never throws: a failed or unconfigured send is logged and
 * swallowed. Account creation (and the auto-login that immediately follows
 * it) must never fail because the welcome email couldn't go out — see
 * auth.service.ts, which calls this after its transaction has already
 * committed. `motDePasse` (the plaintext, one-time password) is never
 * logged here, configured or not — only the mail body itself carries it.
 */
export async function envoyerEmailBienvenue(donnees: EmailBienvenue): Promise<void> {
  if (!transporteur) {
    logger.warn(
      { destinataire: donnees.destinataire, identifiant: donnees.identifiant },
      "SMTP non configuré (SMTP_HOST/PORT/USER/PASSWORD absents) — e-mail de bienvenue non envoyé.",
    );
    return;
  }

  const corpsTexte = [
    `Bonjour ${donnees.prenom},`,
    "",
    `Votre compte sur ${NOM_APPLICATION} a été créé avec succès.`,
    "",
    `Identifiant de connexion : ${donnees.identifiant}`,
    `Mot de passe initial : ${donnees.motDePasse}`,
    "",
    "Conservez précieusement ces informations : elles vous seront demandées lors de vos prochaines connexions.",
    "",
    `Accéder à mon espace : ${URL_CONNEXION}`,
  ].join("\n");

  try {
    await transporteur.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: donnees.destinataire,
      subject: `Bienvenue sur ${NOM_APPLICATION} — vos identifiants de connexion`,
      text: corpsTexte,
      html: rendreLayout(
        rendreContenuBienvenue(donnees),
        `Vos identifiants ${NOM_APPLICATION} — ${donnees.identifiant}`,
      ),
      attachments: piecesJointesLogo,
    });
  } catch (error) {
    logger.error(
      { err: error, destinataire: donnees.destinataire },
      "Échec de l'envoi de l'e-mail de bienvenue.",
    );
  }
}

/**
 * Variante envoyée uniquement au membre qui vient de s'inscrire (jamais aux
 * personnes qu'il/elle a créées — celles-ci reçoivent `envoyerEmailBienvenue`
 * individuellement sur leur propre adresse quand elles en ont une, voir
 * auth.service.ts) : ses propres identifiants, suivis du récapitulatif de
 * toutes les personnes réellement créées pendant cette même inscription
 * (père, mère, fratrie, conjoint·s, enfants), avec leurs propres identifiants
 * — un seul e-mail, jamais un par personne créée. Même politique best-effort
 * que `envoyerEmailBienvenue` ci-dessus : ne fait jamais échouer l'inscription.
 */
export async function envoyerEmailInscriptionComplete(donnees: EmailInscriptionComplete): Promise<void> {
  if (!transporteur) {
    logger.warn(
      { destinataire: donnees.destinataire, identifiant: donnees.identifiant },
      "SMTP non configuré (SMTP_HOST/PORT/USER/PASSWORD absents) — e-mail d'inscription non envoyé.",
    );
    return;
  }

  const lignesRecap = donnees.comptesCrees.flatMap((compte) => [
    `- ${compte.role} — ${compte.nomComplet}${compte.matricule ? ` (${compte.matricule})` : ""}`,
    `  Identifiant : ${compte.identifiant}`,
    `  Mot de passe initial : ${compte.motDePasseTemporaire}`,
  ]);

  const corpsTexte = [
    `Bonjour ${donnees.prenom},`,
    "",
    `Votre compte sur ${NOM_APPLICATION} a été créé avec succès.`,
    "",
    `Identifiant de connexion : ${donnees.identifiant}`,
    `Mot de passe initial : ${donnees.motDePasse}`,
    "",
    "Conservez précieusement ces informations : elles vous seront demandées lors de vos prochaines connexions.",
    "",
    `Accéder à mon espace : ${URL_CONNEXION}`,
    ...(donnees.comptesCrees.length > 0
      ? [
          "",
          "Vous avez également enregistré les personnes suivantes lors de cette inscription, chacune avec son propre compte :",
          "",
          ...lignesRecap,
          "",
          "Conservez aussi ces informations en lieu sûr — elles ne seront plus jamais affichées ni renvoyées.",
        ]
      : []),
  ].join("\n");

  const contenuBienvenue = rendreContenuBienvenue(donnees);
  const contenuRecap =
    donnees.comptesCrees.length > 0
      ? rendre("auth/recap-comptes-crees.html", {
          lignes: donnees.comptesCrees
            .map((compte) =>
              rendre("partials/compte-cree-row.html", {
                role: compte.role,
                nom_complet: compte.nomComplet,
                matricule_affichage: compte.matricule ? `(${compte.matricule})` : "",
                identifiant: compte.identifiant,
                mot_de_passe: compte.motDePasseTemporaire,
              }),
            )
            .join(""),
        })
      : "";
  const html = rendreLayout(
    contenuBienvenue + contenuRecap,
    `Vos identifiants ${NOM_APPLICATION} — ${donnees.identifiant}`,
  );

  try {
    await transporteur.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: donnees.destinataire,
      subject: `Bienvenue sur ${NOM_APPLICATION} — vos identifiants de connexion`,
      text: corpsTexte,
      html,
      attachments: piecesJointesLogo,
    });
  } catch (error) {
    logger.error(
      { err: error, destinataire: donnees.destinataire },
      "Échec de l'envoi de l'e-mail récapitulatif d'inscription.",
    );
  }
}
