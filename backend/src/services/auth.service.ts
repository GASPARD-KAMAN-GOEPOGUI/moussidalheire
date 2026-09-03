import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import {
  genererMatriculesEnLot,
  normaliserSituationGeographique,
  remonteAscendanceContient,
  trouverDoublons,
  trouverParMatriculeOuTelephone,
  trouverParTelephoneEquivalent,
  verifierEmailPersonneDisponible,
  verifierFamilleExiste,
  verifierParentExiste,
  verifierPersonneExiste,
  verifierTelephoneDisponible,
} from "@/services/personne.service";
import {
  creerAvecClient as creerPersonneAvecClient,
  mettreAJourAvecClient,
  mettreAJourPlusieursAvecClient,
  personneRepository,
} from "@/repositories/personne.repository";
import { creerAvecClient as creerFamilleAvecClient } from "@/repositories/famille.repository";
import {
  creerAvecClient as creerUtilisateurAvecClient,
  mettreAJourMotDePasse,
  trouverParEmail,
  trouverParId,
  trouverParIdentifiantOuEmail,
  trouverParPersonneId,
} from "@/repositories/utilisateurs.repository";
import {
  creerAvecClient as creerUnionAvecClient,
  trouverEntreAvecClient,
} from "@/repositories/union.repository";
import { genererMotDePasseAleatoire, hacherMotDePasse, verifierMotDePasse } from "@/utils/password";
import { signerToken, signerRefreshToken, verifierRefreshToken } from "@/utils/jwt";
import { obtenirUtilisateurParId } from "@/services/utilisateurs.service";
import { envoyerEmailBienvenue, envoyerEmailInscriptionComplete } from "@/services/email.service";
import { AppError } from "@/utils/app-error";
import { toUtilisateurPublic, type UtilisateurPublic } from "@/types/utilisateur";
import type { Personne } from "@/models/personne.model";
import type { Utilisateur } from "@/models/utilisateur.model";
import type {
  ChangerMotDePasseInput,
  ConnexionInput,
  InscriptionInput,
  PersonneNouvelleInput,
  RafraichirInput,
} from "@/validators/auth.validator";

/**
 * The only place `Personne` + `Utilisateur` are created together — and the
 * only place a self-registering member's whole known family — père, mère,
 * fratrie, union(s)/conjoint(s) and their enfants — can be created or linked
 * in the same request. Two family structures are kept distinct throughout
 * (per the product's own mental model): the member's famille d'origine
 * (père/mère/fratrie) and their own cellule familiale (unions + enfants) —
 * adding one never touches or removes the other. A single form submission on
 * the frontend must produce one coherent set of rows, not a partially-created
 * family tree — hence the single `prisma.$transaction` below, with every
 * write going through a repository's `creerAvecClient`/`mettreAJourAvecClient`
 * (the `tx` client passed in, not the module-global `prisma` singleton those
 * repositories normally use).
 *
 * Attaching an *already-existing* personne (selected as fratrie or enfant) to
 * a père/mère resolved here never overwrites a conflicting relationship it
 * already has on file — see `attacherOuRejeter` — genealogical data already
 * correct elsewhere must never be silently corrupted by someone else's
 * self-registration.
 *
 * The welcome email is sent *after* the transaction commits, best-effort
 * (see email.service.ts) — its failure must never undo the account, since
 * the caller is about to be logged in immediately regardless of whether the
 * email arrives.
 */

const MATRICULE_MAX_ATTEMPTS = 3;
const MESSAGE_CYCLE =
  "Impossible d'établir cette relation : elle créerait une boucle généalogique.";
const STATUT_UNION_PARENTS = "marie" as const;

export interface CompteCree {
  identifiant: string;
  motDePasseTemporaire: string;
  /** Présent uniquement quand la personne a elle-même un e-mail renseigné —
   * c'est cette adresse (jamais celle du membre qui s'inscrit) qui reçoit,
   * après la transaction, son propre e-mail de bienvenue avec ses propres
   * identifiants (voir la fin de `inscrire`). */
  email?: string;
}

export interface PersonneLiee {
  id: number;
  uuid: string;
  matricule: string | null;
  prenom: string;
  nom: string;
  sexe: "homme" | "femme";
  cree: boolean;
  /** Présent uniquement quand `cree` est vrai — une personne déjà existante,
   * simplement rattachée à cette inscription, ne reçoit jamais de nouveau
   * compte. Chaque personne créée ici reçoit le sien, distinct de celui du
   * membre principal : `identifiant` est son e-mail si elle en a un, sinon
   * son matricule fraîchement attribué. */
  compte?: CompteCree;
}

export interface UnionLiee {
  conjoint: PersonneLiee;
  unionUuid: string;
  statutUnion: string;
  enfants: PersonneLiee[];
}

export interface ResultatInscription {
  personne: Personne;
  utilisateur: UtilisateurPublic;
  token: string;
  refreshToken: string;
  motDePasseTemporaire: string;
  pere?: PersonneLiee;
  mere?: PersonneLiee;
  fratrie: PersonneLiee[];
  unions: UnionLiee[];
  enfantsAutres: PersonneLiee[];
  /** Mères créées à la volée pour un demi-frère/une demi-sœur (`fratrie[i].mere`,
   * mode "nouveau") — le seul cas où une personne créée par cette inscription
   * n'a par ailleurs aucune place dans les tableaux ci-dessus. */
  fratrieMeresCreees: PersonneLiee[];
}

export interface ResultatConnexion {
  utilisateur: UtilisateurPublic;
  token: string;
  refreshToken: string;
}

export interface ResultatRafraichissement {
  token: string;
  refreshToken: string;
}

function toPersonneLiee(personne: Personne, cree: boolean, compte?: CompteCree): PersonneLiee {
  return {
    id: personne.id,
    uuid: personne.uuid,
    matricule: personne.matricule,
    prenom: personne.prenom,
    nom: personne.nom,
    sexe: personne.sexe,
    cree,
    ...(compte ? { compte } : {}),
  };
}

/** Strips undefined keys so a partial `PersonneNouvelleInput` can be spread
 * straight into a Prisma create payload regardless of which optional fields
 * the client actually sent. */
function donneesPersonneNouvelle(donnees: PersonneNouvelleInput): Record<string, unknown> {
  const normalisees = normaliserSituationGeographique(donnees);
  return Object.fromEntries(Object.entries(normalisees).filter(([, valeur]) => valeur !== undefined));
}

/** Builds a `{pereId?, mereId?}` target, omitting a key entirely rather than
 * setting it to `undefined` (required under `exactOptionalPropertyTypes`). */
function cibleParents(
  pereId: number | undefined,
  mereId: number | undefined,
): { pereId?: number; mereId?: number } {
  return {
    ...(pereId !== undefined ? { pereId } : {}),
    ...(mereId !== undefined ? { mereId } : {}),
  };
}

interface NouvellePersonneAEnregistrer {
  source: string;
  prenom: string;
  nom: string;
  dateNaissance: Date | undefined;
  telephone: string | undefined;
  email: string | undefined;
}

function versNouvelleAEnregistrer(
  source: string,
  donnees: PersonneNouvelleInput,
): NouvellePersonneAEnregistrer {
  return {
    source,
    prenom: donnees.prenom,
    nom: donnees.nom,
    dateNaissance: donnees.dateNaissance,
    telephone: donnees.telephone,
    email: donnees.email,
  };
}

export async function inscrire(input: InscriptionInput): Promise<ResultatInscription> {
  let perePersonneExistante: Personne | undefined;
  if (input.pere?.mode === "existant") {
    perePersonneExistante = await verifierParentExiste(input.pere.id, "pereId");
    if (perePersonneExistante.sexe !== "homme") {
      throw AppError.conflict("Le père doit être une personne de sexe masculin.", {
        field: "pere",
      });
    }
  }

  let merePersonneExistante: Personne | undefined;
  if (input.mere?.mode === "existant") {
    merePersonneExistante = await verifierParentExiste(input.mere.id, "mereId");
    if (merePersonneExistante.sexe !== "femme") {
      throw AppError.conflict("La mère doit être une personne de sexe féminin.", { field: "mere" });
    }
  }

  // Un père/une mère déjà existant·e connaît déjà sa vraie famille — parfois
  // une famille relative dans une hiérarchie à plusieurs niveaux (voir
  // Famille.familleParenteId) — qui doit être réutilisée plutôt que la valeur
  // manuelle du formulaire. Sans aucun parent existant, on retombe sur le
  // choix explicite du formulaire (vérifié ci-dessous), ou — s'il est absent —
  // sur `nouvelleFamille` : le père est alors créé de toutes pièces et fonde
  // sa propre famille (voir plus bas, à l'intérieur de la transaction). Le
  // schema garantit déjà qu'au moins un des trois signaux est présent.
  const familleIdConnu =
    perePersonneExistante?.familleId ?? merePersonneExistante?.familleId ?? input.familleId;
  const nouvelleFamilleInput = input.nouvelleFamille;
  if (
    familleIdConnu !== undefined &&
    perePersonneExistante === undefined &&
    merePersonneExistante === undefined
  ) {
    await verifierFamilleExiste(familleIdConnu);
  }

  // Famille d'origine : fratrie, et — cas demi-frère/demi-sœur — la mère
  // propre à une fratrie "nouveau", si elle diffère de celle du membre.
  const fratrieExistantes = new Map<number, Personne>();
  const fratrieMeresExistantes = new Map<number, Personne>();
  for (const [i, entry] of input.fratrie.entries()) {
    if (entry.mode === "existant") {
      fratrieExistantes.set(i, await verifierPersonneExiste(entry.id, `fratrie[${i}]`));
    } else if (entry.mere?.mode === "existant") {
      const m = await verifierParentExiste(entry.mere.id, "mereId");
      if (m.sexe !== "femme") {
        throw AppError.conflict(
          "La mère d'un frère ou d'une sœur doit être une personne de sexe féminin.",
          {
            field: `fratrie[${i}].mere`,
          },
        );
      }
      fratrieMeresExistantes.set(i, m);
    }
  }

  // Cellule familiale : chaque union porte son propre conjoint et ses propres
  // enfants ; enfantsAutres couvre les enfants dont l'autre parent n'est pas
  // déclaré dans cette inscription.
  const unionsConjointsExistants = new Map<number, Personne>();
  const unionsEnfantsExistants = new Map<string, Personne>();
  for (const [ui, u] of input.unions.entries()) {
    if (u.conjoint.mode === "existant") {
      unionsConjointsExistants.set(
        ui,
        await verifierPersonneExiste(u.conjoint.id, `unions[${ui}].conjoint`),
      );
    }
    for (const [ei, e] of u.enfants.entries()) {
      if (e.mode === "existant") {
        unionsEnfantsExistants.set(
          `${ui}:${ei}`,
          await verifierPersonneExiste(e.id, `unions[${ui}].enfants[${ei}]`),
        );
      }
    }
  }
  const enfantsAutresExistants = new Map<number, Personne>();
  for (const [i, e] of input.enfantsAutres.entries()) {
    if (e.mode === "existant") {
      enfantsAutresExistants.set(i, await verifierPersonneExiste(e.id, `enfantsAutres[${i}]`));
    }
  }

  // Guaranteed by inscriptionSchema's refine (unions non-vide ⇒ statutMatrimonial
  // ∉ {undefined, "celibataire"}) — re-checked here defensively since Zod's
  // cross-field refine doesn't narrow the inferred type.
  if (
    input.unions.length > 0 &&
    (input.statutMatrimonial === undefined || input.statutMatrimonial === "celibataire")
  ) {
    throw AppError.internal("Statut matrimonial incohérent avec les unions déclarées.");
  }
  const statutUnion = input.statutMatrimonial as "marie" | "divorce" | "veuf" | undefined;

  if (input.email) {
    const emailExistant = await trouverParEmail(input.email);
    if (emailExistant) {
      throw AppError.conflict("Cette adresse e-mail est déjà associée à un compte.", {
        field: "email",
      });
    }
  }

  const nouvelles: NouvellePersonneAEnregistrer[] = [
    versNouvelleAEnregistrer("membre", {
      prenom: input.prenom,
      nom: input.nom,
      sexe: input.sexe,
      dateNaissance: input.dateNaissance,
      telephone: input.telephone,
      email: input.email,
    }),
    ...(input.pere?.mode === "nouveau"
      ? [versNouvelleAEnregistrer("pere", input.pere.donnees)]
      : []),
    ...(input.mere?.mode === "nouveau"
      ? [versNouvelleAEnregistrer("mere", input.mere.donnees)]
      : []),
    ...input.fratrie.flatMap((f, i) => {
      if (f.mode !== "nouveau") return [];
      const entries = [versNouvelleAEnregistrer(`fratrie[${i}]`, f.donnees)];
      if (f.mere?.mode === "nouveau")
        entries.push(versNouvelleAEnregistrer(`fratrie[${i}].mere`, f.mere.donnees));
      return entries;
    }),
    ...input.unions.flatMap((u, ui) => {
      const entries: NouvellePersonneAEnregistrer[] = [];
      if (u.conjoint.mode === "nouveau")
        entries.push(versNouvelleAEnregistrer(`unions[${ui}].conjoint`, u.conjoint.donnees));
      for (const [ei, e] of u.enfants.entries()) {
        if (e.mode === "nouveau")
          entries.push(versNouvelleAEnregistrer(`unions[${ui}].enfants[${ei}]`, e.donnees));
      }
      return entries;
    }),
    ...input.enfantsAutres.flatMap((e, i) =>
      e.mode === "nouveau" ? [versNouvelleAEnregistrer(`enfantsAutres[${i}]`, e.donnees)] : [],
    ),
  ];

  // Téléphone/e-mail sont uniques sur toute personne (voir schema.prisma) —
  // vérifiés inconditionnellement (jamais contournable par forcerCreation,
  // contrairement au doublon nom+date ci-dessous qui n'est qu'une coïncidence
  // possible). D'abord entre les personnes de cette même requête (aucune
  // n'est encore en base pour se détecter elles-mêmes), puis contre la base.
  for (const [i, a] of nouvelles.entries()) {
    for (const b of nouvelles.slice(i + 1)) {
      if (a.telephone && a.telephone === b.telephone) {
        throw AppError.conflict(
          "Deux personnes de cette inscription partagent le même numéro de téléphone.",
          {
            field: b.source,
          },
        );
      }
      if (a.email && a.email === b.email) {
        throw AppError.conflict(
          "Deux personnes de cette inscription partagent la même adresse e-mail.",
          {
            field: b.source,
          },
        );
      }
    }
  }
  for (const { source, telephone, email } of nouvelles) {
    if (telephone)
      await verifierTelephoneDisponible(telephone, source === "membre" ? "telephone" : source);
    if (email) await verifierEmailPersonneDisponible(email, source === "membre" ? "email" : source);
    // Chaque personne créée ici reçoit désormais son propre compte (voir
    // creerCompte plus bas) — son e-mail doit donc aussi être libre côté
    // Utilisateur, pas seulement côté Personne. Celui du membre est déjà
    // vérifié séparément ci-dessus (`emailExistant`).
    if (email && source !== "membre" && (await trouverParEmail(email))) {
      throw AppError.conflict("Cette adresse e-mail est déjà associée à un compte.", {
        field: source,
      });
    }
  }

  if (!input.forcerCreation) {
    for (const { source, prenom, nom, dateNaissance } of nouvelles) {
      const doublons = await trouverDoublons(prenom, nom, dateNaissance);
      if (doublons.length > 0) {
        throw AppError.conflict(
          "Une ou plusieurs fiches portent déjà ce prénom, ce nom et cette date de naissance. " +
            "Renvoyez la requête avec forcerCreation=true pour créer quand même.",
          { source, doublons: doublons.map((d) => ({ id: d.uuid, prenom: d.prenom, nom: d.nom })) },
        );
      }
    }
  }

  const motDePasseClair = genererMotDePasseAleatoire(input.nom);
  const motDePasseHash = await hacherMotDePasse(motDePasseClair);

  // `nouvelles` contient exactement une entrée par personne à créer (le
  // membre inclus) — son nombre EST le nombre de matricules à réserver, sans
  // dupliquer une formule à maintenir en parallèle.
  const nbNouvelles = nouvelles.length;

  /** Rattache une personne déjà existante (fratrie/enfant) au père/mère
   * résolus ici — jamais d'écrasement d'une relation déjà enregistrée et
   * différente : conflit explicite (409) à la place. Ne touche à rien si
   * elle est déjà exactement cohérente avec la cible. */
  async function attacherOuRejeter(
    tx: Prisma.TransactionClient,
    existante: Personne,
    cible: { pereId?: number; mereId?: number },
    generation: number,
    roleLabel: string,
  ): Promise<Personne> {
    if (
      cible.pereId !== undefined &&
      existante.pereId !== null &&
      existante.pereId !== cible.pereId
    ) {
      throw AppError.conflict(`${roleLabel} a déjà un père enregistré différent.`, {
        field: roleLabel,
      });
    }
    if (
      cible.mereId !== undefined &&
      existante.mereId !== null &&
      existante.mereId !== cible.mereId
    ) {
      throw AppError.conflict(`${roleLabel} a déjà une mère enregistrée différente.`, {
        field: roleLabel,
      });
    }
    const pereAMettre = existante.pereId === null ? cible.pereId : undefined;
    const mereAMettre = existante.mereId === null ? cible.mereId : undefined;
    if (pereAMettre === undefined && mereAMettre === undefined) return existante; // déjà cohérent

    if (pereAMettre !== undefined && (await remonteAscendanceContient(existante.id, pereAMettre))) {
      throw AppError.conflict(MESSAGE_CYCLE, { field: roleLabel });
    }
    if (mereAMettre !== undefined && (await remonteAscendanceContient(existante.id, mereAMettre))) {
      throw AppError.conflict(MESSAGE_CYCLE, { field: roleLabel });
    }

    return mettreAJourAvecClient(
      tx,
      { id: existante.id },
      {
        ...(pereAMettre !== undefined ? { pereId: pereAMettre } : {}),
        ...(mereAMettre !== undefined ? { mereId: mereAMettre } : {}),
        generation,
      },
    );
  }

  /** Union père↔mère pour une personne "nouveau" (mère d'un demi-frère, ou
   * conjoint d'une union) — crée l'Union avec `epouxId` si elle n'existe pas
   * déjà, sans jamais la dupliquer. Tous les appels de ce fichier passent
   * toujours un père (sexe déjà vérifié "homme") puis une mère (sexe déjà
   * vérifié "femme") — jamais l'inverse. */
  async function unirSiNecessaire(
    tx: Prisma.TransactionClient,
    epouxId: number | undefined,
    epouseId: number,
  ): Promise<void> {
    if (epouxId === undefined) return;
    const dejaUnies = await trouverEntreAvecClient(tx, epouxId, epouseId);
    if (!dejaUnies) {
      await creerUnionAvecClient(tx, {
        epouxId,
        epouseId,
        statut: STATUT_UNION_PARENTS,
      });
    }
  }

  /** Every personne created by this inscription gets its own real compte —
   * never the membre's — with its own freshly generated mot de passe.
   * `identifiant` is the personne's e-mail when she has one, otherwise her
   * just-attributed matricule (already unique, so no collision risk there). */
  async function creerCompte(
    tx: Prisma.TransactionClient,
    personne: Personne,
    email: string | undefined,
  ): Promise<CompteCree> {
    const motDePasseTemporaire = genererMotDePasseAleatoire(personne.nom);
    const motDePasseHashPersonne = await hacherMotDePasse(motDePasseTemporaire);
    const identifiant = email ?? personne.matricule ?? String(personne.uuid);
    await creerUtilisateurAvecClient(tx, {
      identifiant,
      ...(email ? { email } : {}),
      motDePasseHash: motDePasseHashPersonne,
      personneId: personne.id,
    });
    return { identifiant, motDePasseTemporaire, ...(email ? { email } : {}) };
  }

  let cree:
    | {
        membre: Personne;
        utilisateur: Utilisateur;
        pere: PersonneLiee | undefined;
        mere: PersonneLiee | undefined;
        fratrie: PersonneLiee[];
        unions: UnionLiee[];
        enfantsAutres: PersonneLiee[];
        fratrieMeresCreees: PersonneLiee[];
      }
    | undefined;

  for (let tentative = 1; tentative <= MATRICULE_MAX_ATTEMPTS; tentative++) {
    const matricules = await genererMatriculesEnLot(nbNouvelles);
    let curseur = 0;
    const prochainMatricule = (): string => {
      const matricule = matricules[curseur++];
      if (!matricule) throw AppError.internal("Erreur de génération de matricule.");
      return matricule;
    };

    try {
      cree = await prisma.$transaction(async (tx) => {
        // Fonde une nouvelle famille (fondatrice) au sein même de cette
        // transaction si aucune famille réelle n'a pu être résolue plus haut
        // (ni père/mère existant, ni familleId manuel) — refaite à chaque
        // tentative de la boucle de retry pour rester cohérente avec le
        // rollback en cas d'échec (collision de matricule).
        let familleIdResolu = familleIdConnu;
        if (familleIdResolu === undefined) {
          if (!nouvelleFamilleInput) {
            throw AppError.internal("Famille introuvable pour cette inscription.");
          }
          const familleCreee = await creerFamilleAvecClient(tx, {
            nom: nouvelleFamilleInput.nom,
            estFondatriceOrigine: true,
          });
          familleIdResolu = familleCreee.id;
        }

        // Chaque personne réellement créée pendant CETTE inscription (jamais
        // une existante simplement rattachée) — stampée en une seule requête
        // avec `creeParUtilisateurId = ` le compte du membre une fois créé
        // plus bas (voir Personne.creeParUtilisateurId) : c'est le membre qui
        // a saisi ces informations, donc lui qui pourra les corriger plus
        // tard tant que la personne concernée ne s'est pas encore connectée
        // elle-même. Le membre lui-même n'y figure jamais — sa propre fiche
        // est couverte par la règle "c'est sa propre fiche", pas celle-ci.
        const idsCreesPendantInscription: number[] = [];

        let pereId: number | undefined;
        let pereGeneration: number | undefined;
        let pereLiee: PersonneLiee | undefined;
        if (perePersonneExistante) {
          pereId = perePersonneExistante.id;
          pereGeneration = perePersonneExistante.generation;
          pereLiee = toPersonneLiee(perePersonneExistante, false);
        } else if (input.pere?.mode === "nouveau") {
          const p = await creerPersonneAvecClient(tx, {
            ...donneesPersonneNouvelle(input.pere.donnees),
            matricule: prochainMatricule(),
            familleId: familleIdResolu,
            generation: 0,
          } as Prisma.PersonneUncheckedCreateInput);
          pereId = p.id;
          pereGeneration = p.generation;
          idsCreesPendantInscription.push(p.id);
          const compte = await creerCompte(tx, p, input.pere.donnees.email);
          pereLiee = toPersonneLiee(p, true, compte);
        }

        let mereId: number | undefined;
        let mereGeneration: number | undefined;
        let mereLiee: PersonneLiee | undefined;
        if (merePersonneExistante) {
          mereId = merePersonneExistante.id;
          mereGeneration = merePersonneExistante.generation;
          mereLiee = toPersonneLiee(merePersonneExistante, false);
        } else if (input.mere?.mode === "nouveau") {
          const m = await creerPersonneAvecClient(tx, {
            ...donneesPersonneNouvelle(input.mere.donnees),
            matricule: prochainMatricule(),
            familleId: familleIdResolu,
            generation: 0,
          } as Prisma.PersonneUncheckedCreateInput);
          mereId = m.id;
          mereGeneration = m.generation;
          idsCreesPendantInscription.push(m.id);
          const compte = await creerCompte(tx, m, input.mere.donnees.email);
          mereLiee = toPersonneLiee(m, true, compte);
        }

        // Le père et la mère du membre sont, de fait, conjoints — jamais
        // créés comme deux personnes indépendantes sans lien entre elles.
        if (pereId !== undefined && mereId !== undefined) {
          await unirSiNecessaire(tx, pereId, mereId);
        }

        const generationMembre =
          pereGeneration !== undefined
            ? pereGeneration + 1
            : mereGeneration !== undefined
              ? mereGeneration + 1
              : 0;

        const fratrieLiee: PersonneLiee[] = [];
        const fratrieMeresCreees: PersonneLiee[] = [];
        for (const [i, entry] of input.fratrie.entries()) {
          if (entry.mode === "existant") {
            const existante = fratrieExistantes.get(i)!;
            const misAJour = await attacherOuRejeter(
              tx,
              existante,
              cibleParents(pereId, mereId),
              generationMembre,
              `fratrie[${i}]`,
            );
            fratrieLiee.push(toPersonneLiee(misAJour, false));
            continue;
          }

          // "nouveau" — même père que le membre par construction ; la mère
          // par défaut est celle du membre, sauf surcharge explicite
          // (demi-frère/demi-sœur, père polygame).
          let mereFratrieId = mereId;
          if (entry.mere?.mode === "existant") {
            const m = fratrieMeresExistantes.get(i)!;
            mereFratrieId = m.id;
            await unirSiNecessaire(tx, pereId, m.id);
          } else if (entry.mere?.mode === "nouveau") {
            const m = await creerPersonneAvecClient(tx, {
              ...donneesPersonneNouvelle(entry.mere.donnees),
              matricule: prochainMatricule(),
              familleId: familleIdResolu,
              generation: 0,
            } as Prisma.PersonneUncheckedCreateInput);
            mereFratrieId = m.id;
            idsCreesPendantInscription.push(m.id);
            await unirSiNecessaire(tx, pereId, m.id);
            const compte = await creerCompte(tx, m, entry.mere.donnees.email);
            fratrieMeresCreees.push(toPersonneLiee(m, true, compte));
          }

          const f = await creerPersonneAvecClient(tx, {
            ...donneesPersonneNouvelle(entry.donnees),
            matricule: prochainMatricule(),
            familleId: familleIdResolu,
            generation: generationMembre,
            ...(pereId !== undefined ? { pereId } : {}),
            ...(mereFratrieId !== undefined ? { mereId: mereFratrieId } : {}),
          } as Prisma.PersonneUncheckedCreateInput);
          idsCreesPendantInscription.push(f.id);
          const compteFratrie = await creerCompte(tx, f, entry.donnees.email);
          fratrieLiee.push(toPersonneLiee(f, true, compteFratrie));
        }

        const situationMembre = normaliserSituationGeographique(input);
        const membre = await creerPersonneAvecClient(tx, {
          matricule: prochainMatricule(),
          prenom: input.prenom,
          nom: input.nom,
          sexe: input.sexe,
          familleId: familleIdResolu,
          generation: generationMembre,
          ...(input.email ? { email: input.email } : {}),
          ...(input.photo ? { photo: input.photo } : {}),
          ...(input.telephone ? { telephone: input.telephone } : {}),
          ...(input.dateNaissance ? { dateNaissance: input.dateNaissance } : {}),
          ...(input.lieuNaissance ? { lieuNaissance: input.lieuNaissance } : {}),
          ...(input.statutMatrimonial ? { statutMatrimonial: input.statutMatrimonial } : {}),
          ...(input.profession ? { profession: input.profession } : {}),
          ...(situationMembre.estAuVillage !== undefined ? { estAuVillage: situationMembre.estAuVillage } : {}),
          ...(situationMembre.estEnGuinee !== undefined ? { estEnGuinee: situationMembre.estEnGuinee } : {}),
          ...(pereId !== undefined ? { pereId } : {}),
          ...(mereId !== undefined ? { mereId } : {}),
        });

        // Même repli que `creerCompte` ci-dessus pour chaque personne créée à
        // la volée : l'e-mail sert d'identifiant quand il est fourni, sinon
        // le matricule fraîchement attribué (jamais vide, jamais en
        // collision — voir prochainMatricule()).
        const identifiantMembre = input.email ?? membre.matricule ?? String(membre.uuid);
        const utilisateur = await creerUtilisateurAvecClient(tx, {
          identifiant: identifiantMembre,
          ...(input.email ? { email: input.email } : {}),
          motDePasseHash,
          personneId: membre.id,
        });

        const membreEstHomme = input.sexe === "homme";

        // Cellule familiale : chaque union porte son conjoint ET ses propres
        // enfants — jamais mélangée avec la famille d'origine ci-dessus.
        const unionsLiees: UnionLiee[] = [];
        for (const [ui, unionEntry] of input.unions.entries()) {
          let conjoint: Personne;
          let conjointCree: boolean;
          let conjointCompte: CompteCree | undefined;
          const existant = unionsConjointsExistants.get(ui);
          if (existant) {
            conjoint = existant;
            conjointCree = false;
          } else if (unionEntry.conjoint.mode === "nouveau") {
            conjoint = await creerPersonneAvecClient(tx, {
              ...donneesPersonneNouvelle(unionEntry.conjoint.donnees),
              matricule: prochainMatricule(),
              familleId: familleIdResolu,
              generation: 0,
            } as Prisma.PersonneUncheckedCreateInput);
            conjointCree = true;
            idsCreesPendantInscription.push(conjoint.id);
            conjointCompte = await creerCompte(tx, conjoint, unionEntry.conjoint.donnees.email);
          } else {
            continue; // ne devrait jamais arriver : couvert par unionsConjointsExistants
          }

          // Le sexe du/de la conjoint·e n'est pas contraint par rapport à
          // celui du membre dans ce flux (contrairement au père/à la mère,
          // vérifiés plus haut) — priorité au sexe réel de chacun·e pour
          // choisir qui est epoux/epouse ; à défaut (les deux du même
          // sexe), le membre reste epoux par convention stable, jamais un
          // choix aléatoire.
          const epoux = membre.sexe === "homme" ? membre : conjoint.sexe === "homme" ? conjoint : membre;
          const epouse = epoux === membre ? conjoint : membre;
          const union = await creerUnionAvecClient(tx, {
            epouxId: epoux.id,
            epouseId: epouse.id,
            statut: statutUnion!,
          });

          // Le modèle pereId/mereId suppose un couple homme/femme (déjà vrai
          // partout ailleurs dans l'app — voir les vérifications de sexe sur
          // père/mère) : un slot pour chacun selon son sexe réel.
          const parentsEnfant: { pereId?: number; mereId?: number } = {};
          if (membreEstHomme) parentsEnfant.pereId = membre.id;
          else parentsEnfant.mereId = membre.id;
          if (conjoint.sexe === "homme") parentsEnfant.pereId = conjoint.id;
          else parentsEnfant.mereId = conjoint.id;

          const enfantsLies: PersonneLiee[] = [];
          for (const [ei, enfantRef] of unionEntry.enfants.entries()) {
            const roleLabel = `unions[${ui}].enfants[${ei}]`;
            if (enfantRef.mode === "existant") {
              const existanteEnfant = unionsEnfantsExistants.get(`${ui}:${ei}`)!;
              const misAJour = await attacherOuRejeter(
                tx,
                existanteEnfant,
                parentsEnfant,
                generationMembre + 1,
                roleLabel,
              );
              enfantsLies.push(toPersonneLiee(misAJour, false));
              continue;
            }
            const e = await creerPersonneAvecClient(tx, {
              ...donneesPersonneNouvelle(enfantRef.donnees),
              matricule: prochainMatricule(),
              familleId: familleIdResolu,
              generation: generationMembre + 1,
              ...(parentsEnfant.pereId !== undefined ? { pereId: parentsEnfant.pereId } : {}),
              ...(parentsEnfant.mereId !== undefined ? { mereId: parentsEnfant.mereId } : {}),
            } as Prisma.PersonneUncheckedCreateInput);
            idsCreesPendantInscription.push(e.id);
            const compteEnfant = await creerCompte(tx, e, enfantRef.donnees.email);
            enfantsLies.push(toPersonneLiee(e, true, compteEnfant));
          }

          unionsLiees.push({
            conjoint: toPersonneLiee(conjoint, conjointCree, conjointCompte),
            unionUuid: union.uuid,
            statutUnion: union.statut,
            enfants: enfantsLies,
          });
        }

        // Enfants du membre dont l'autre parent n'est pas déclaré ici — un
        // seul FK (celui du membre) est renseigné.
        const enfantsAutresLiees: PersonneLiee[] = [];
        const parentMembreSeul: { pereId?: number; mereId?: number } = membreEstHomme
          ? { pereId: membre.id }
          : { mereId: membre.id };
        for (const [i, enfantRef] of input.enfantsAutres.entries()) {
          const roleLabel = `enfantsAutres[${i}]`;
          if (enfantRef.mode === "existant") {
            const existanteEnfant = enfantsAutresExistants.get(i)!;
            const misAJour = await attacherOuRejeter(
              tx,
              existanteEnfant,
              parentMembreSeul,
              generationMembre + 1,
              roleLabel,
            );
            enfantsAutresLiees.push(toPersonneLiee(misAJour, false));
            continue;
          }
          const e = await creerPersonneAvecClient(tx, {
            ...donneesPersonneNouvelle(enfantRef.donnees),
            matricule: prochainMatricule(),
            familleId: familleIdResolu,
            generation: generationMembre + 1,
            ...(parentMembreSeul.pereId !== undefined ? { pereId: parentMembreSeul.pereId } : {}),
            ...(parentMembreSeul.mereId !== undefined ? { mereId: parentMembreSeul.mereId } : {}),
          } as Prisma.PersonneUncheckedCreateInput);
          idsCreesPendantInscription.push(e.id);
          const compteEnfantAutre = await creerCompte(tx, e, enfantRef.donnees.email);
          enfantsAutresLiees.push(toPersonneLiee(e, true, compteEnfantAutre));
        }

        if (idsCreesPendantInscription.length > 0) {
          await mettreAJourPlusieursAvecClient(
            tx,
            { id: { in: idsCreesPendantInscription } },
            { creeParUtilisateurId: utilisateur.id },
          );
        }

        return {
          membre,
          utilisateur,
          pere: pereLiee,
          mere: mereLiee,
          fratrie: fratrieLiee,
          unions: unionsLiees,
          enfantsAutres: enfantsAutresLiees,
          fratrieMeresCreees,
        };
      });
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const cible = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
        if (cible.includes("matricule")) {
          if (tentative === MATRICULE_MAX_ATTEMPTS) {
            throw AppError.internal("Impossible de générer un matricule.");
          }
          continue; // retry with a freshly computed batch of matricules
        }
        if (cible.includes("email") || cible.includes("identifiant")) {
          throw AppError.conflict("Cette adresse e-mail est déjà associée à un compte.", {
            field: "email",
          });
        }
      }
      throw error;
    }
  }

  if (!cree) {
    throw AppError.internal("Impossible de créer le compte.");
  }

  const payloadJeton = { utilisateurId: cree.utilisateur.id, utilisateurUuid: cree.utilisateur.uuid };
  const token = signerToken(payloadJeton);
  const refreshToken = signerRefreshToken(payloadJeton);

  // Toute personne réellement créée pendant cette inscription (jamais une
  // personne existante simplement rattachée), avec le libellé de son rôle
  // pour le récapitulatif envoyé au membre — voir plus bas.
  const personnesCreesAvecRole: { liee: PersonneLiee; role: string }[] = [
    ...(cree.pere ? [{ liee: cree.pere, role: "Père" }] : []),
    ...(cree.mere ? [{ liee: cree.mere, role: "Mère" }] : []),
    ...cree.fratrie.map((liee) => ({
      liee,
      role: liee.sexe === "homme" ? "Frère" : "Sœur",
    })),
    ...cree.fratrieMeresCreees.map((liee) => ({ liee, role: "Mère (fratrie)" })),
    ...cree.unions.map((u) => ({ liee: u.conjoint, role: "Conjoint·e" })),
    ...cree.unions.flatMap((u) => u.enfants.map((liee) => ({ liee, role: "Enfant" }))),
    ...cree.enfantsAutres.map((liee) => ({ liee, role: "Enfant" })),
  ].filter(({ liee }) => liee.cree && liee.compte);

  // Best-effort — never awaited-and-thrown into the response path; see
  // email.service.ts's own doc comment for why this can't fail the request.
  // Rien à envoyer au membre s'il n'a fourni aucun e-mail : ses identifiants
  // restent visibles une seule fois dans la réponse (`motDePasseTemporaire`),
  // affichés par le frontend dans la modale CredentialsDialog.
  if (input.email) {
    void envoyerEmailInscriptionComplete({
      destinataire: input.email,
      prenom: input.prenom,
      identifiant: cree.utilisateur.identifiant,
      motDePasse: motDePasseClair,
      comptesCrees: personnesCreesAvecRole.map(({ liee, role }) => ({
        role,
        nomComplet: `${liee.prenom} ${liee.nom}`,
        matricule: liee.matricule,
        identifiant: liee.compte!.identifiant,
        motDePasseTemporaire: liee.compte!.motDePasseTemporaire,
      })),
    });
  }

  // Chaque personne créée reçoit en plus, séparément, ses propres
  // identifiants sur sa propre adresse — uniquement quand elle en a une
  // (voir `CompteCree.email`, renseigné seulement dans ce cas).
  for (const { liee } of personnesCreesAvecRole) {
    if (!liee.compte?.email) continue;
    void envoyerEmailBienvenue({
      destinataire: liee.compte.email,
      prenom: liee.prenom,
      identifiant: liee.compte.identifiant,
      motDePasse: liee.compte.motDePasseTemporaire,
    });
  }

  return {
    personne: cree.membre,
    utilisateur: toUtilisateurPublic(cree.utilisateur),
    token,
    refreshToken,
    motDePasseTemporaire: motDePasseClair,
    ...(cree.pere ? { pere: cree.pere } : {}),
    ...(cree.mere ? { mere: cree.mere } : {}),
    fratrie: cree.fratrie,
    unions: cree.unions,
    enfantsAutres: cree.enfantsAutres,
    fratrieMeresCreees: cree.fratrieMeresCreees,
  };
}

/**
 * Retrouve le compte derrière ce que le membre a tapé dans l'unique champ de
 * la page de connexion : son identifiant, son e-mail, son matricule ou son
 * téléphone. Aucun de ces quatre n'est déclaré par le client — c'est ici, et
 * nulle part ailleurs, qu'on établit à quoi la saisie correspond.
 *
 * Essais successifs, du plus direct au plus tolérant, chacun ne servant que
 * si le précédent n'a rien donné :
 *
 * 1. `identifiant`/`email`, la saisie telle quelle — le cas courant, sur des
 *    colonnes uniques et indexées.
 * 2. Les mêmes en minuscules puis en majuscules. Un e-mail est toujours
 *    stocké en minuscules (voir `optionalEmailSchema`) et un matricule
 *    toujours en majuscules (`MSD-000123`), alors que personne ne tape ses
 *    propres coordonnées avec la casse exacte. MySQL compare le plus souvent
 *    sans tenir compte de la casse, mais cela dépend de la collation de la
 *    base : ne pas s'en remettre à une configuration de serveur pour savoir
 *    si un membre peut se connecter.
 * 3. `matricule`/`telephone` de la fiche `Personne`, puis son compte lié.
 * 4. Le téléphone sous une autre écriture (voir
 *    personne.service.ts::trouverParTelephoneEquivalent) : les numéros sont
 *    stockés exactement tels qu'ils ont été saisis, donc un numéro enregistré
 *    avant la règle de saisie peut porter espaces ou tirets que le membre ne
 *    reproduira pas à l'identique.
 *
 * Une fiche peut exister sans compte (père, mère, fratrie créés au fil d'une
 * inscription) : `trouverParPersonneId` renvoie alors `null` et la connexion
 * échoue, ce qui est le comportement voulu — retrouver la personne n'est pas
 * lui ouvrir une session.
 */
async function resoudreUtilisateurPourConnexion(valeur: string): Promise<Utilisateur | null> {
  const saisie = valeur.trim();
  if (!saisie) return null;

  const variantes = [...new Set([saisie, saisie.toLowerCase(), saisie.toUpperCase()])];
  for (const variante of variantes) {
    const compte = await trouverParIdentifiantOuEmail(variante);
    if (compte) return compte;
  }

  for (const variante of variantes) {
    const personne = await trouverParMatriculeOuTelephone(variante);
    if (personne) return trouverParPersonneId(personne.id);
  }

  const parTelephone = await trouverParTelephoneEquivalent(saisie);
  if (!parTelephone) return null;
  return trouverParPersonneId(parTelephone.id);
}

export async function connecter(input: ConnexionInput): Promise<ResultatConnexion> {
  const utilisateur = await resoudreUtilisateurPourConnexion(input.identifiant);
  if (!utilisateur) {
    throw AppError.unauthorized("Identifiant ou mot de passe incorrect.");
  }
  if (utilisateur.supprime || !utilisateur.actif) {
    throw AppError.unauthorized("Ce compte est désactivé.");
  }

  const motDePasseValide = await verifierMotDePasse(input.motDePasse, utilisateur.motDePasseHash);
  if (!motDePasseValide) {
    throw AppError.unauthorized("Identifiant ou mot de passe incorrect.");
  }

  const payloadJeton = { utilisateurId: utilisateur.id, utilisateurUuid: utilisateur.uuid };
  const token = signerToken(payloadJeton);
  const refreshToken = signerRefreshToken(payloadJeton);
  return { utilisateur: toUtilisateurPublic(utilisateur), token, refreshToken };
}

/**
 * Exchanges a still-valid refresh token for a brand-new access token — and a
 * brand-new refresh token with a fresh expiry (sliding window), never the
 * same one echoed back: as long as the frontend calls this before the
 * previous refresh token's (long) expiry, a genuinely active member is never
 * forced to log back in. No revocation list exists (same deliberately
 * stateless design as the access token — see jwt.ts), so, like the access
 * token, a leaked refresh token remains usable until it naturally expires;
 * this is an accepted trade-off for this application (see the module's
 * design notes), not an oversight.
 */
export async function rafraichir(input: RafraichirInput): Promise<ResultatRafraichissement> {
  const payload = verifierRefreshToken(input.refreshToken);
  const utilisateur = await obtenirUtilisateurParId(payload.utilisateurId);
  if (!utilisateur.actif || utilisateur.supprime) {
    throw AppError.unauthorized("Ce compte est désactivé.");
  }

  const payloadJeton = { utilisateurId: utilisateur.id, utilisateurUuid: utilisateur.uuid };
  return {
    token: signerToken(payloadJeton),
    refreshToken: signerRefreshToken(payloadJeton),
  };
}

/**
 * Enriches `GET /auth/moi`'s response with the caller's own `personneUuid` —
 * same enrichment pattern as `pereUuid`/`mereUuid`/`familleUuid` elsewhere:
 * the frontend only ever addresses a personne by uuid, never by the internal
 * numeric `personneId` already on `UtilisateurPublic`. Scoped to this one
 * endpoint (not `requireAuth` itself) so the extra lookup never runs on
 * every authenticated request, only when a caller actually asks "who am I".
 */
export async function moi(utilisateur: UtilisateurPublic): Promise<UtilisateurPublic> {
  if (!utilisateur.personneId) return utilisateur;
  const personne = await personneRepository.findById({ id: utilisateur.personneId });
  return personne ? { ...utilisateur, personneUuid: personne.uuid } : utilisateur;
}

/**
 * Self-service password change for the currently authenticated utilisateur —
 * the only way a member (or a personne created on their behalf — père/mère/
 * fratrie/conjoint/enfant, each with their own compte, see `creerCompte`
 * above) replaces the initial `nom` + 4-digit password they were issued.
 * Deliberately does NOT ask for the current password — the bearer token
 * alone authorizes the change (a product decision, not an oversight: this
 * means anyone in possession of a still-valid session/token can swap the
 * password without knowing the old one, so a hijacked/left-open session can
 * lock the real owner out).
 */
export async function changerMotDePasse(
  utilisateurId: number,
  input: ChangerMotDePasseInput,
): Promise<void> {
  const utilisateur = await trouverParId(utilisateurId);
  if (!utilisateur) {
    throw AppError.notFound("Utilisateur introuvable.");
  }

  const inchange = await verifierMotDePasse(input.nouveauMotDePasse, utilisateur.motDePasseHash);
  if (inchange) {
    throw AppError.conflict("Le nouveau mot de passe doit être différent de l'actuel.", {
      field: "nouveauMotDePasse",
    });
  }

  const motDePasseHash = await hacherMotDePasse(input.nouveauMotDePasse);
  await mettreAJourMotDePasse(utilisateur.id, motDePasseHash);
}
