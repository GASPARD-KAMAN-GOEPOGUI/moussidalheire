import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { personneRepository, creerAvecClient as creerPersonneAvecClient } from "@/repositories/personne.repository";
import { creerAvecClient as creerUtilisateurAvecClient } from "@/repositories/utilisateurs.repository";
import { familleRepository } from "@/repositories/famille.repository";
import { brancheRepository } from "@/repositories/branche.repository";
import { residencePersonneRepository } from "@/repositories/residence-personne.repository";
import { lieuRepository } from "@/repositories/lieu.repository";
import { creerAvecClient as creerUnionAvecClient } from "@/repositories/union.repository";
import { genererMotDePasseAleatoire, hacherMotDePasse } from "@/utils/password";
import type { Personne } from "@/models/personne.model";
import type { UtilisateurPublic } from "@/types/utilisateur";
import type {
  AjouterConjointInput,
  AjouterEnfantInput,
  CreatePersonneInput,
  ListPersonneQuery,
  UpdatePersonneInput,
} from "@/validators/personne.validator";
import { AppError } from "@/utils/app-error";
import { chiffresSignificatifs, memeNumero } from "@/utils/telephone";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/**
 * Real business rules for `personnes`, reproducing the logic already
 * validated in the existing frontend (`generator.ts`/`genealogy.ts`):
 * matricule auto-generation, generation auto-calculation, cycle detection on
 * pereId/mereId, duplicate detection. Not covered here: spouse linking
 * (lives in the `unions` module, not yet completed) and cascading
 * generation/branch recalculation onto existing descendants when a parent
 * changes (documented limitation — see the module-completion plan).
 */

const MATRICULE_PREFIX = "MSD";
const MATRICULE_MAX_ATTEMPTS = 3;

function formatMatricule(numero: number): string {
  return `${MATRICULE_PREFIX}-${String(numero).padStart(6, "0")}`;
}

// Exported (not just used internally by `creer`/`modifier` below): the
// self-registration flow in auth.service.ts reuses these same read-only
// pre-flight checks/calculations rather than re-implementing them — see that
// file for why the actual writes there go through a Prisma transaction
// instead of calling this module's `creer` directly.

/**
 * Reserves `quantite` consecutive matricules in a single MAX(...) read —
 * needed whenever more than one `Personne` is created in the same request
 * (e.g. self-registration with père/mère/fratrie/conjoints in one
 * transaction): calling `genererMatricule()` once per person would re-read
 * the same uncommitted MAX and hand out the same number to all of them.
 */
export async function genererMatriculesEnLot(quantite: number): Promise<string[]> {
  if (quantite === 0) return [];
  const maxNumero = await personneRepository.trouverMatriculeMaxNumero();
  return Array.from({ length: quantite }, (_, i) => formatMatricule(maxNumero + 1 + i));
}

export async function genererMatricule(): Promise<string> {
  const [matricule] = await genererMatriculesEnLot(1);
  if (!matricule) throw AppError.internal("Erreur de génération de matricule.");
  return matricule;
}

export async function calculerGeneration(pereId?: number, mereId?: number): Promise<number> {
  const parentId = pereId ?? mereId;
  if (parentId === undefined) return 0;
  const parent = await personneRepository.findById({ id: parentId });
  return parent ? parent.generation + 1 : 0;
}

// Toutes les vérifications d'existence ci-dessous filtrent `deletedAt: null`
// (via `findOne`, jamais `findById`) — une famille/branche/personne désactivée
// ne doit jamais pouvoir être référencée comme si elle était active (famille
// d'une personne, père/mère, branche, famille parente).

export async function verifierFamilleExiste(familleId: number): Promise<void> {
  const famille = await familleRepository.findOne({ id: familleId, deletedAt: null });
  if (!famille) {
    throw AppError.notFound("Famille introuvable.", { field: "familleId" });
  }
}

async function verifierBrancheExiste(brancheId: number): Promise<void> {
  const branche = await brancheRepository.findOne({ id: brancheId, deletedAt: null });
  if (!branche) {
    throw AppError.notFound("Branche introuvable.", { field: "brancheId" });
  }
}

export async function verifierParentExiste(
  parentId: number,
  champ: "pereId" | "mereId",
): Promise<Personne> {
  const parent = await personneRepository.findOne({ id: parentId, deletedAt: null });
  if (!parent) {
    throw AppError.notFound(champ === "pereId" ? "Père introuvable." : "Mère introuvable.", {
      field: champ,
    });
  }
  return parent;
}

/** Generic existence check for a person referenced by id from a request body
 * (fratrie/conjoint entries in self-registration) — `champ` names the exact
 * field in the error so the frontend can point the user back at it. */
export async function verifierPersonneExiste(id: number, champ: string): Promise<Personne> {
  const personne = await personneRepository.findOne({ id, deletedAt: null });
  if (!personne) {
    throw AppError.notFound("Personne introuvable.", { field: champ });
  }
  return personne;
}

/**
 * Fait respecter la seule règle de cohérence de la situation géographique
 * simplifiée : une personne au village est nécessairement en Guinée.
 * `estAuVillage: true` force donc toujours `estEnGuinee: true`, quoi que le
 * client ait envoyé — jamais confié au seul frontend, appliqué ici à chaque
 * écriture (`creer`/`modifier` ci-dessous, `creerEnfantConnecte`/
 * `creerConjointConnecte`, et réutilisé par auth.service.ts pour le membre
 * principal et pour père/mère/fratrie/conjoint/enfant créés à la volée).
 * N'agit jamais sur `estAuVillage` lui-même, et laisse `estEnGuinee` intact
 * quand `estAuVillage` est `false` ou absent.
 */
export function normaliserSituationGeographique<
  T extends { estAuVillage?: boolean | undefined; estEnGuinee?: boolean | undefined },
>(input: T): T {
  if (input.estAuVillage !== true) return input;
  return { ...input, estEnGuinee: true };
}

/** Formule de rattachement familial introduite par Mission 2 — le père
 * l'emporte, puis la mère, puis la valeur saisie par l'appelant (formulaire
 * ou payload API). Partagée par `creer()` ci-dessous et
 * `auth.service.ts::inscrire()` pour ne jamais dupliquer cette règle. */
export function resoudreFamilleDepuisParents(
  pereFamilleId: number | undefined,
  mereFamilleId: number | undefined,
  familleIdSaisi: number,
): number {
  return pereFamilleId ?? mereFamilleId ?? familleIdSaisi;
}

/** `telephone`/`email` are unique across every fiche (see the `@unique` on
 * `Personne` in schema.prisma) — both also double as login identifiers (see
 * auth.service.ts::connecter), so a collision here is always a hard error,
 * never something `forcerCreation` can bypass (unlike the name+birthdate
 * doublon heuristic below, which is a "might be a coincidence" check). */
export async function verifierTelephoneDisponible(telephone: string, champ: string): Promise<void> {
  const existant = await personneRepository.findOne({ deletedAt: null, telephone });
  if (existant) {
    throw AppError.conflict("Ce numéro de téléphone est déjà associé à une autre fiche.", {
      field: champ,
    });
  }
}

export async function verifierEmailPersonneDisponible(email: string, champ: string): Promise<void> {
  const existant = await personneRepository.findOne({ deletedAt: null, email });
  if (existant) {
    throw AppError.conflict("Cette adresse e-mail est déjà associée à une autre fiche.", {
      field: champ,
    });
  }
}

/** Resolves a login identifier that might be a matricule or a phone number
 * (email/identifiant are checked separately against `Utilisateur` — see
 * auth.service.ts::connecter, which tries that first). */
export async function trouverParMatriculeOuTelephone(valeur: string): Promise<Personne | null> {
  return personneRepository.findOne({
    deletedAt: null,
    OR: [{ matricule: valeur }, { telephone: valeur }],
  });
}

/**
 * Retrouve la fiche dont le téléphone est une autre écriture de `valeur` —
 * second essai de la connexion par téléphone, quand l'égalité stricte
 * ci-dessus a échoué parce que le numéro dort en base sous une forme
 * différente de celle que le membre vient de taper (voir
 * auth.service.ts::resoudreUtilisateurPourConnexion).
 *
 * Ne compare rien en dessous de 8 chiffres : au-dessous, la présélection ne
 * discrimine plus rien et la saisie n'est de toute façon pas un numéro.
 *
 * Renvoie `null` — donc refuse la connexion — dès que PLUSIEURS fiches
 * correspondent. La contrainte d'unicité sur `personnes.telephone` empêche
 * deux fiches de partager un numéro à l'identique, mais pas d'en porter deux
 * écritures différentes si elles ont été enregistrées avant la règle de
 * saisie ("620 00 00 00" et "+224620000000"). Un numéro ambigu ne doit
 * jamais authentifier quelqu'un : mieux vaut un refus, que l'administrateur
 * tranchera sur les fiches, qu'une connexion sur la mauvaise identité.
 */
export async function trouverParTelephoneEquivalent(valeur: string): Promise<Personne | null> {
  const chiffres = chiffresSignificatifs(valeur);
  if (chiffres.length < 8) return null;

  const candidats = await personneRepository.trouverCandidatsParTelephone(chiffres.slice(-8));
  const correspondances = candidats.filter((c) => c.telephone && memeNumero(c.telephone, valeur));
  if (correspondances.length !== 1) return null;

  return personneRepository.findById({ id: correspondances[0]!.id });
}

const CYCLE_ERROR_MESSAGE =
  "Impossible d'établir cette relation : elle créerait une boucle généalogique.";

/** Walks up the ancestor chain starting at `depuisId` (père, puis mère si pas
 * de père) — true si `candidateId` y apparaît. Mirrors the frontend's
 * `wouldCreateCycle`. A visited-set guards against pre-existing corrupted
 * data looping forever. Exported: auth.service.ts reuses this same check
 * before attaching an already-existing personne (selected as fratrie/enfant)
 * to a père/mère resolved during self-registration. */
export async function remonteAscendanceContient(
  candidateId: number,
  depuisId: number,
): Promise<boolean> {
  let curseurId: number | null = depuisId;
  const visites = new Set<number>();
  while (curseurId !== null) {
    if (curseurId === candidateId) return true;
    if (visites.has(curseurId)) return false;
    visites.add(curseurId);
    const curseur: Personne | null = await personneRepository.findById({ id: curseurId });
    if (!curseur) return false;
    curseurId = curseur.pereId ?? curseur.mereId ?? null;
  }
  return false;
}

/** Résidence actuelle d'une personne, aplatie avec les données de son `Lieu`
 * (jamais dupliquées en base — voir `ResidencePersonne`/`Lieu` dans
 * schema.prisma) pour éviter à chaque appelant un aller-retour séparé sur
 * `/lieux/:id`. Absent si la personne n'a aucune résidence marquée
 * `estActuelle`. */
export interface ResidenceActuelleDto {
  residenceUuid: string;
  lieuUuid: string;
  pays: string;
  ville: string;
  region?: string;
  quartier?: string;
  estVillage: boolean;
  latitude?: number;
  longitude?: number;
  anneeDebut?: number;
}

export interface PersonneAvecUuids extends Personne {
  pereUuid?: string;
  mereUuid?: string;
  familleUuid: string;
  brancheNom?: string;
  residenceActuelle?: ResidenceActuelleDto;
}

/**
 * Adds `pereUuid`/`mereUuid`/`familleUuid` alongside the existing numeric
 * `pereId`/`mereId`/`familleId` — the frontend identifies every resource by
 * UUID (matching what `GET /personnes/:id` and `GET /familles/:id` expect),
 * but `Personne`'s own FK columns are internal numeric ids, never UUIDs.
 * Also resolves `brancheNom` from `brancheId` — branches are displayed by
 * name, never navigated to by id/uuid, so a name is enough (no `brancheUuid`
 * needed) — and `residenceActuelle` from the (at most one, see
 * `residence-personne.service.ts`) résidence marquée `estActuelle` for that
 * personne. Bounded to at most 5 extra queries total (one batched `IN (...)`
 * lookup each for personnes/familles/branches/résidences actuelles/lieux),
 * regardless of how many personnes are being enriched — never one query per
 * row.
 */
export async function enrichirAvecUuids(personnes: Personne[]): Promise<PersonneAvecUuids[]> {
  const idsPersonnes = new Set<number>();
  const idsFamilles = new Set<number>();
  const idsBranches = new Set<number>();
  const idsPersonnesPourResidence = personnes.map((p) => p.id);
  for (const p of personnes) {
    if (p.pereId !== null) idsPersonnes.add(p.pereId);
    if (p.mereId !== null) idsPersonnes.add(p.mereId);
    idsFamilles.add(p.familleId);
    if (p.brancheId !== null) idsBranches.add(p.brancheId);
  }

  const [parents, familles, branches, residencesActuelles] = await Promise.all([
    idsPersonnes.size > 0
      ? personneRepository.findAll({ where: { id: { in: [...idsPersonnes] } } })
      : Promise.resolve([]),
    idsFamilles.size > 0
      ? familleRepository.findAll({ where: { id: { in: [...idsFamilles] } } })
      : Promise.resolve([]),
    idsBranches.size > 0
      ? brancheRepository.findAll({ where: { id: { in: [...idsBranches] } } })
      : Promise.resolve([]),
    idsPersonnesPourResidence.length > 0
      ? residencePersonneRepository.findAll({
          where: { personneId: { in: idsPersonnesPourResidence }, estActuelle: true, deletedAt: null },
        })
      : Promise.resolve([]),
  ]);
  const uuidParPersonneId = new Map(parents.map((p) => [p.id, p.uuid]));
  const uuidParFamilleId = new Map(familles.map((f) => [f.id, f.uuid]));
  const nomParBrancheId = new Map(branches.map((b) => [b.id, b.nom]));

  const idsLieux = new Set(residencesActuelles.map((r) => r.lieuId));
  const lieux =
    idsLieux.size > 0 ? await lieuRepository.findAll({ where: { id: { in: [...idsLieux] } } }) : [];
  const lieuParId = new Map(lieux.map((l) => [l.id, l]));
  const residenceParPersonneId = new Map(residencesActuelles.map((r) => [r.personneId, r]));

  return personnes.map((p) => {
    const residence = residenceParPersonneId.get(p.id);
    const lieu = residence ? lieuParId.get(residence.lieuId) : undefined;
    return {
      ...p,
      ...(p.pereId !== null && uuidParPersonneId.has(p.pereId)
        ? { pereUuid: uuidParPersonneId.get(p.pereId)! }
        : {}),
      ...(p.mereId !== null && uuidParPersonneId.has(p.mereId)
        ? { mereUuid: uuidParPersonneId.get(p.mereId)! }
        : {}),
      familleUuid: uuidParFamilleId.get(p.familleId) ?? "",
      ...(p.brancheId !== null && nomParBrancheId.has(p.brancheId)
        ? { brancheNom: nomParBrancheId.get(p.brancheId)! }
        : {}),
      ...(residence && lieu
        ? {
            residenceActuelle: {
              residenceUuid: residence.uuid,
              lieuUuid: lieu.uuid,
              pays: lieu.pays,
              ville: lieu.ville,
              ...(lieu.region ? { region: lieu.region } : {}),
              ...(lieu.quartier ? { quartier: lieu.quartier } : {}),
              estVillage: lieu.estVillage,
              ...(lieu.latitude !== null ? { latitude: Number(lieu.latitude) } : {}),
              ...(lieu.longitude !== null ? { longitude: Number(lieu.longitude) } : {}),
              ...(residence.anneeDebut !== null ? { anneeDebut: residence.anneeDebut } : {}),
            } satisfies ResidenceActuelleDto,
          }
        : {}),
    };
  });
}

async function enrichirUneAvecUuids(personne: Personne): Promise<PersonneAvecUuids> {
  const [enrichie] = await enrichirAvecUuids([personne]);
  return enrichie!;
}

export async function trouverDoublons(
  prenom: string,
  nom: string,
  dateNaissance?: Date,
): Promise<Personne[]> {
  return personneRepository.findAll({
    where: {
      deletedAt: null,
      prenom,
      nom,
      ...(dateNaissance ? { dateNaissance } : {}),
    },
  });
}

export async function lister(
  query: ListPersonneQuery,
): Promise<{ personnes: PersonneAvecUuids[]; pagination: PaginationMeta }> {
  const where: Prisma.PersonneWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.actif !== undefined ? { actif: query.actif } : {}),
    ...(query.familleId !== undefined ? { familleId: query.familleId } : {}),
    ...(query.recherche
      ? {
          OR: [
            { prenom: { contains: query.recherche } },
            { nom: { contains: query.recherche } },
            { profession: { contains: query.recherche } },
          ],
        }
      : {}),
    ...(query.matricule ? { matricule: query.matricule } : {}),
    ...(query.profession ? { profession: query.profession } : {}),
    ...(query.estDecede !== undefined ? { estDecede: query.estDecede } : {}),
  };
  // `nom`/`generation` are single-field orders only — the repository's
  // generic `findAll` is typed for one `PersonneOrderByWithRelationInput`,
  // not Prisma's compound-array form, so there's no secondary tie-break here.
  const orderBy: Prisma.PersonneOrderByWithRelationInput =
    query.trierPar === "nom"
      ? { nom: "asc" }
      : query.trierPar === "generation"
        ? { generation: "asc" }
        : { createdAt: "desc" };
  const { skip, take } = toSkipTake(query);
  const [brutes, total] = await Promise.all([
    personneRepository.findAll({ where, skip, take, orderBy }),
    personneRepository.count(where),
  ]);
  const personnes = await enrichirAvecUuids(brutes);
  return { personnes, pagination: buildPaginationMeta(query, total) };
}

async function obtenirBruteParUuid(uuid: string): Promise<Personne> {
  const personne = await personneRepository.findOne({ uuid });
  if (!personne) {
    throw AppError.notFound("Personne introuvable.");
  }
  return personne;
}

export async function obtenirParUuid(uuid: string): Promise<PersonneAvecUuids> {
  return enrichirUneAvecUuids(await obtenirBruteParUuid(uuid));
}

/**
 * Restriction de modification des personnes : un `membre` standard ne peut
 * modifier que sa propre fiche (`utilisateur.personneId`) ou une fiche qu'il
 * a réellement créée (`personne.creeParUtilisateurId`) — jamais déduit d'un
 * lien familial (même famille, père/mère/enfant, même branche), qui ne prouve
 * rien sur qui a saisi la fiche. Un admin conserve tous ses droits actuels.
 */
export function peutModifierPersonne(utilisateur: UtilisateurPublic, personne: Personne): boolean {
  if (utilisateur.role === "admin") return true;
  if (utilisateur.personneId === personne.id) return true;
  return utilisateur.id === personne.creeParUtilisateurId;
}

function verifierDroitModification(utilisateur: UtilisateurPublic, personne: Personne): void {
  if (!peutModifierPersonne(utilisateur, personne)) {
    throw AppError.forbidden("Vous ne pouvez pas modifier les informations de cette personne.");
  }
}

export async function creer(input: CreatePersonneInput, creeParUtilisateurId: number): Promise<Personne> {
  if (input.brancheId !== undefined) await verifierBrancheExiste(input.brancheId);
  const pere =
    input.pereId !== undefined ? await verifierParentExiste(input.pereId, "pereId") : undefined;
  const mere =
    input.mereId !== undefined ? await verifierParentExiste(input.mereId, "mereId") : undefined;
  if (input.telephone) await verifierTelephoneDisponible(input.telephone, "telephone");
  if (input.email) await verifierEmailPersonneDisponible(input.email, "email");

  // Mission 2 : un père/une mère déjà existant·e connaît déjà sa vraie
  // famille (parfois une famille relative) — elle est réutilisée plutôt que
  // la valeur saisie. Sans aucun parent existant, la valeur saisie fait foi
  // et doit alors, elle, être vérifiée.
  const familleId = resoudreFamilleDepuisParents(pere?.familleId, mere?.familleId, input.familleId);
  if (pere === undefined && mere === undefined) {
    await verifierFamilleExiste(input.familleId);
  }

  if (!input.forcerCreation) {
    const doublons = await trouverDoublons(input.prenom, input.nom, input.dateNaissance);
    if (doublons.length > 0) {
      throw AppError.conflict(
        "Une ou plusieurs fiches portent déjà ce prénom, ce nom et cette date de naissance. " +
          "Renvoyez la requête avec forcerCreation=true pour créer quand même.",
        { doublons: doublons.map((d) => ({ id: d.uuid, prenom: d.prenom, nom: d.nom })) },
      );
    }
  }

  const generation = await calculerGeneration(input.pereId, input.mereId);
  const { forcerCreation: _forcerCreation, ...donnees } = normaliserSituationGeographique(input);

  for (let tentative = 1; tentative <= MATRICULE_MAX_ATTEMPTS; tentative++) {
    const matricule = await genererMatricule();
    try {
      return await personneRepository.create({
        ...donnees,
        familleId,
        matricule,
        generation,
        creeParUtilisateurId,
      } as Prisma.PersonneUncheckedCreateInput);
    } catch (error) {
      const estConflitMatricule =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        (error.meta.target as string[]).includes("matricule");
      if (!estConflitMatricule || tentative === MATRICULE_MAX_ATTEMPTS) throw error;
    }
  }
  /* c8 ignore next */
  throw AppError.internal("Impossible de générer un matricule.");
}

export async function modifier(
  uuid: string,
  input: UpdatePersonneInput,
  utilisateur: UtilisateurPublic,
): Promise<Personne> {
  const existante = await obtenirBruteParUuid(uuid);
  verifierDroitModification(utilisateur, existante);

  if (input.familleId !== existante.familleId) {
    await verifierFamilleExiste(input.familleId);
  }
  const brancheActuelle = existante.brancheId ?? undefined;
  if (input.brancheId !== brancheActuelle && input.brancheId !== undefined) {
    await verifierBrancheExiste(input.brancheId);
  }

  const pereActuel = existante.pereId ?? undefined;
  const pereChange = input.pereId !== pereActuel;
  const mereActuel = existante.mereId ?? undefined;
  const mereChange = input.mereId !== mereActuel;

  if (pereChange && input.pereId !== undefined) {
    await verifierParentExiste(input.pereId, "pereId");
    if (await remonteAscendanceContient(existante.id, input.pereId)) {
      throw AppError.conflict(CYCLE_ERROR_MESSAGE, { field: "pereId" });
    }
  }
  if (mereChange && input.mereId !== undefined) {
    await verifierParentExiste(input.mereId, "mereId");
    if (await remonteAscendanceContient(existante.id, input.mereId)) {
      throw AppError.conflict(CYCLE_ERROR_MESSAGE, { field: "mereId" });
    }
  }

  if (input.telephone && input.telephone !== existante.telephone) {
    await verifierTelephoneDisponible(input.telephone, "telephone");
  }
  if (input.email && input.email !== existante.email) {
    await verifierEmailPersonneDisponible(input.email, "email");
  }

  const generation =
    pereChange || mereChange
      ? await calculerGeneration(input.pereId, input.mereId)
      : existante.generation;

  const misAJour = await personneRepository.update({ id: existante.id }, {
    ...normaliserSituationGeographique(input),
    generation,
  } as Prisma.PersonneUncheckedUpdateInput);

  // Le nom d'une famille est copié depuis son fondateur une seule fois, à la
  // création (voir famille.service.ts::creer / le frontend
  // AddFoundingFamilyDialog) — jamais reressaisi ensuite. Si CE fondateur
  // corrige son propre nom plus tard, la lignée qu'il a fondée doit rester
  // cohérente avec son vrai nom plutôt que de garder indéfiniment l'ancienne
  // orthographe. Ne concerne que le fondateur exact (`ancetreId`) : renommer
  // n'importe quel autre membre de la famille ne doit jamais toucher au nom
  // de la lignée.
  if (input.nom !== existante.nom) {
    const familleFondee = await familleRepository.findOne({ ancetreId: existante.id, deletedAt: null });
    if (familleFondee) {
      await familleRepository.update({ id: familleFondee.id }, { nom: input.nom });
    }
  }

  return misAJour;
}

export async function desactiver(uuid: string): Promise<Personne> {
  const existante = await obtenirBruteParUuid(uuid);
  return personneRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<Personne> {
  const existante = await obtenirBruteParUuid(uuid);
  return personneRepository.restore({ id: existante.id });
}

/** Enfants dont cette personne est le père ou la mère — jamais stockés,
 * toujours dérivés de `pereId`/`mereId`. */
export async function listerEnfants(uuid: string): Promise<PersonneAvecUuids[]> {
  const personne = await obtenirBruteParUuid(uuid);
  return enrichirAvecUuids(await personneRepository.trouverEnfants(personne.id));
}

/** Personnes partageant le même père ou la même mère. */
export async function listerFratrie(uuid: string): Promise<PersonneAvecUuids[]> {
  const personne = await obtenirBruteParUuid(uuid);
  return enrichirAvecUuids(
    await personneRepository.trouverFratrie(personne.id, personne.pereId, personne.mereId),
  );
}

/** Conjoint·e·s déduit·e·s de la table `unions` — lecture seule ici (la
 * création/modification d'une union passe par le module `unions` lui-même,
 * `POST/PUT /unions`, jamais par ce endpoint). */
export async function listerConjoints(uuid: string): Promise<PersonneAvecUuids[]> {
  const personne = await obtenirBruteParUuid(uuid);
  return enrichirAvecUuids(await personneRepository.trouverConjoints(personne.id));
}

export interface CompteEnfantCree {
  identifiant: string;
  motDePasseTemporaire: string;
}

/**
 * "Ajouter mes enfants" (espace personnel) — avec `auth.service.ts::inscrire`,
 * le seul autre endroit où une `Personne` et son `Utilisateur` sont créés
 * ensemble, dans la même transaction. `parentPersonneId` vient exclusivement
 * de `req.utilisateur.personneId` (voir personne.controller.ts) — jamais du
 * corps de la requête : un utilisateur connecté ne peut donc jamais créer un
 * enfant rattaché à quelqu'un d'autre que lui-même, même en envoyant un
 * `pereId` arbitraire depuis le navigateur (`ajouterEnfantSchema` n'accepte
 * d'ailleurs pas ce champ du tout).
 *
 * Toujours `pereId` (jamais `mereId`, quel que soit le sexe du parent
 * connecté) : reflète littéralement la règle métier demandée pour ce
 * parcours. Un utilisateur connecté de sexe féminin verrait donc, elle
 * aussi, ses enfants rattachés via `pereId` — limitation connue, assumée
 * plutôt que devinée (voir le rapport de mission).
 *
 * Aucune détection de doublon ici (contrairement à `creer()` ci-dessus) :
 * le formulaire volontairement minimal de ce parcours ne le prévoit pas.
 */
export async function creerEnfantConnecte(
  parentPersonneId: number,
  donnees: AjouterEnfantInput,
  creeParUtilisateurId: number,
): Promise<{ enfant: Personne; compte: CompteEnfantCree }> {
  const parent = await personneRepository.findOne({ id: parentPersonneId, deletedAt: null });
  if (!parent) {
    throw AppError.notFound("Votre fiche personne est introuvable — impossible d'ajouter un enfant.");
  }

  const generation = parent.generation + 1;
  const motDePasseClair = genererMotDePasseAleatoire(parent.nom);
  const motDePasseHash = await hacherMotDePasse(motDePasseClair);
  const situation = normaliserSituationGeographique(donnees);

  for (let tentative = 1; tentative <= MATRICULE_MAX_ATTEMPTS; tentative++) {
    const matricule = await genererMatricule();
    try {
      const { enfant, utilisateur } = await prisma.$transaction(async (tx) => {
        const enfant = await creerPersonneAvecClient(tx, {
          prenom: donnees.prenom,
          nom: parent.nom,
          sexe: donnees.sexe,
          familleId: parent.familleId,
          generation,
          matricule,
          pereId: parent.id,
          creeParUtilisateurId,
          ...(donnees.photo ? { photo: donnees.photo } : {}),
          ...(donnees.dateNaissance ? { dateNaissance: donnees.dateNaissance } : {}),
          ...(situation.estAuVillage !== undefined ? { estAuVillage: situation.estAuVillage } : {}),
          ...(situation.estEnGuinee !== undefined ? { estEnGuinee: situation.estEnGuinee } : {}),
        });

        const utilisateur = await creerUtilisateurAvecClient(tx, {
          identifiant: matricule,
          motDePasseHash,
          personneId: enfant.id,
        });

        return { enfant, utilisateur };
      });

      return {
        enfant,
        compte: { identifiant: utilisateur.identifiant, motDePasseTemporaire: motDePasseClair },
      };
    } catch (error) {
      const estConflitMatricule =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        (error.meta.target as string[]).includes("matricule");
      if (!estConflitMatricule || tentative === MATRICULE_MAX_ATTEMPTS) throw error;
    }
  }
  /* c8 ignore next */
  throw AppError.internal("Impossible de générer un matricule.");
}

/**
 * "Ajouter mon/ma conjoint·e" (espace personnel) — même schéma transactionnel
 * que `creerEnfantConnecte` ci-dessus (personne + compte + retry matricule),
 * plus la création de l'union elle-même. `parentPersonneId` vient exclusivement
 * de `req.utilisateur.personneId` (voir personne.controller.ts) : un
 * utilisateur connecté ne peut donc jamais créer un·e conjoint·e rattaché·e à
 * quelqu'un d'autre que lui-même.
 *
 * Sexe toujours déduit comme l'opposé de celui de l'utilisateur connecté
 * (jamais accepté depuis le client) ; génération identique à celle du
 * conjoint connecté (contrairement à un enfant, qui est +1) ; `familleId`
 * hérité, sans pereId/mereId (un·e conjoint·e rejoint la famille sans être
 * fille/fils de qui que ce soit dedans).
 */
export async function creerConjointConnecte(
  parentPersonneId: number,
  donnees: AjouterConjointInput,
  creeParUtilisateurId: number,
): Promise<{ conjoint: Personne; compte: CompteEnfantCree }> {
  const parent = await personneRepository.findOne({ id: parentPersonneId, deletedAt: null });
  if (!parent) {
    throw AppError.notFound("Votre fiche personne est introuvable — impossible d'ajouter un·e conjoint·e.");
  }

  const sexeConjoint = parent.sexe === "homme" ? "femme" : "homme";
  const motDePasseClair = genererMotDePasseAleatoire(donnees.nom);
  const motDePasseHash = await hacherMotDePasse(motDePasseClair);
  const situation = normaliserSituationGeographique(donnees);

  for (let tentative = 1; tentative <= MATRICULE_MAX_ATTEMPTS; tentative++) {
    const matricule = await genererMatricule();
    try {
      const { conjoint, utilisateur } = await prisma.$transaction(async (tx) => {
        const conjoint = await creerPersonneAvecClient(tx, {
          prenom: donnees.prenom,
          nom: donnees.nom,
          sexe: sexeConjoint,
          familleId: parent.familleId,
          generation: parent.generation,
          matricule,
          creeParUtilisateurId,
          ...(donnees.photo ? { photo: donnees.photo } : {}),
          ...(donnees.telephone ? { telephone: donnees.telephone } : {}),
          ...(situation.estAuVillage !== undefined ? { estAuVillage: situation.estAuVillage } : {}),
          ...(situation.estEnGuinee !== undefined ? { estEnGuinee: situation.estEnGuinee } : {}),
        });

        const utilisateur = await creerUtilisateurAvecClient(tx, {
          identifiant: matricule,
          motDePasseHash,
          personneId: conjoint.id,
        });

        // `sexeConjoint` est toujours l'opposé de `parent.sexe` (voir plus
        // haut) — epoux/epouse peuvent donc être assignés avec certitude
        // plutôt que positionnellement.
        await creerUnionAvecClient(tx, {
          epouxId: parent.sexe === "homme" ? parent.id : conjoint.id,
          epouseId: parent.sexe === "femme" ? parent.id : conjoint.id,
          statut: "marie",
        });

        return { conjoint, utilisateur };
      });

      return {
        conjoint,
        compte: { identifiant: utilisateur.identifiant, motDePasseTemporaire: motDePasseClair },
      };
    } catch (error) {
      const estConflitMatricule =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(error.meta?.target) &&
        (error.meta.target as string[]).includes("matricule");
      if (!estConflitMatricule || tentative === MATRICULE_MAX_ATTEMPTS) throw error;
    }
  }
  /* c8 ignore next */
  throw AppError.internal("Impossible de générer un matricule.");
}
