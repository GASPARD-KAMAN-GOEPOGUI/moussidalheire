import type { Prisma } from "@prisma/client";
import { familleRepository } from "@/repositories/famille.repository";
import { personneRepository } from "@/repositories/personne.repository";
import type { Famille } from "@/models/famille.model";
import type {
  CreateFamilleInput,
  ListFamilleQuery,
  UpdateFamilleInput,
} from "@/validators/famille.validator";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";
import type { UtilisateurPublic } from "@/types/utilisateur";

const CYCLE_ERROR_MESSAGE =
  "Impossible d'établir cette relation : elle créerait une boucle entre familles.";

export interface FamilleAvecUuid extends Famille {
  ancetreUuid?: string;
  familleParenteUuid?: string;
  /** Dérivé de `familleParenteId === null` — jamais stocké, pour ne pas
   * dupliquer une information déjà représentée par le champ lui-même. */
  estFondatrice: boolean;
}

/** Adds `ancetreUuid`/`familleParenteUuid` alongside the existing numeric ids
 * — the frontend identifies personnes/familles par uuid, matching
 * `enrichirAvecUuids` in personne.service.ts pour la même raison. Bornée à
 * deux lookups batchés `IN (...)`, quelle que soit la taille de la liste. */
async function enrichirAvecUuid(familles: Famille[]): Promise<FamilleAvecUuid[]> {
  const ancetreIds = new Set<number>();
  const parenteIds = new Set<number>();
  for (const f of familles) {
    if (f.ancetreId !== null) ancetreIds.add(f.ancetreId);
    if (f.familleParenteId !== null) parenteIds.add(f.familleParenteId);
  }
  const [ancetres, parentes] = await Promise.all([
    ancetreIds.size > 0
      ? personneRepository.findAll({ where: { id: { in: [...ancetreIds] } } })
      : Promise.resolve([]),
    parenteIds.size > 0
      ? familleRepository.findAll({ where: { id: { in: [...parenteIds] } } })
      : Promise.resolve([]),
  ]);
  const ancetreUuidParId = new Map(ancetres.map((p) => [p.id, p.uuid]));
  const parenteUuidParId = new Map(parentes.map((f) => [f.id, f.uuid]));
  return familles.map((f) => ({
    ...f,
    estFondatrice: f.familleParenteId === null,
    ...(f.ancetreId !== null && ancetreUuidParId.has(f.ancetreId)
      ? { ancetreUuid: ancetreUuidParId.get(f.ancetreId)! }
      : {}),
    ...(f.familleParenteId !== null && parenteUuidParId.has(f.familleParenteId)
      ? { familleParenteUuid: parenteUuidParId.get(f.familleParenteId)! }
      : {}),
  }));
}

/** "toutes" (admin, ou aucun utilisateur authentifié — comportement public
 * inchangé) ou l'ensemble des ids de familles visibles pour un membre. */
export type UniversFamilial = "toutes" | Set<number>;

/** Famille fondatrice de la lignée : remonte via `familleParenteId` jusqu'à
 * l'id sans famille parente. Réutilise la même marche que `obtenirChaine`,
 * sans construire le tableau enrichi complet. */
async function obtenirIdFondatrice(familleId: number): Promise<number> {
  let curseurId = familleId;
  const visites = new Set<number>([familleId]);
  for (;;) {
    const famille = await familleRepository.findById({ id: curseurId });
    if (!famille || famille.familleParenteId === null) return curseurId;
    if (visites.has(famille.familleParenteId)) return curseurId; // boucle corrompue pré-existante
    visites.add(famille.familleParenteId);
    curseurId = famille.familleParenteId;
  }
}

/** Tout le clan descendant de `racineId` (elle-même incluse) — BFS niveau par
 * niveau via `trouverRelativesParLot`, un aller-retour DB par génération. */
async function obtenirDescendance(racineId: number): Promise<Set<number>> {
  const ids = new Set<number>([racineId]);
  let frontiere = [racineId];
  while (frontiere.length > 0) {
    const enfants = await familleRepository.trouverRelativesParLot(frontiere);
    frontiere = enfants.map((f) => f.id).filter((id) => !ids.has(id));
    for (const id of frontiere) ids.add(id);
  }
  return ids;
}

/** Univers familial visible pour un utilisateur donné : un admin voit tout ;
 * un membre voit tout le clan (toutes les familles descendant de la même
 * famille fondatrice que la sienne) ; un membre sans personne rattachée ne
 * voit rien. `undefined` (pas d'utilisateur — appel non authentifié) doit
 * être traité en amont comme "toutes" par l'appelant, pour préserver le
 * comportement public existant (voir attachUtilisateurSiPresent). */
export async function resoudreUniversFamilial(
  utilisateur: Pick<UtilisateurPublic, "role" | "personneId">,
): Promise<UniversFamilial> {
  if (utilisateur.role === "admin") return "toutes";
  if (utilisateur.personneId === null) return new Set();
  const personne = await personneRepository.findById({ id: utilisateur.personneId });
  if (!personne) return new Set();
  const fondatriceId = await obtenirIdFondatrice(personne.familleId);
  return obtenirDescendance(fondatriceId);
}

function verifierAccesUnivers(familleId: number, univers: UniversFamilial): void {
  if (univers !== "toutes" && !univers.has(familleId)) {
    throw AppError.forbidden("Cette famille ne fait pas partie de votre univers familial.");
  }
}

export async function lister(
  query: ListFamilleQuery,
  univers: UniversFamilial = "toutes",
): Promise<{ familles: FamilleAvecUuid[]; pagination: PaginationMeta }> {
  const where: Prisma.FamilleWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.recherche ? { nom: { contains: query.recherche } } : {}),
    ...(univers !== "toutes" ? { id: { in: [...univers] } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [brutes, total] = await Promise.all([
    familleRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    familleRepository.count(where),
  ]);
  const familles = await enrichirAvecUuid(brutes);
  return { familles, pagination: buildPaginationMeta(query, total) };
}

async function obtenirBruteParUuid(uuid: string): Promise<Famille> {
  const famille = await familleRepository.findOne({ uuid });
  if (!famille) {
    throw AppError.notFound("Famille introuvable.");
  }
  return famille;
}

export async function obtenirParUuid(
  uuid: string,
  univers: UniversFamilial = "toutes",
): Promise<FamilleAvecUuid> {
  const famille = await obtenirBruteParUuid(uuid);
  verifierAccesUnivers(famille.id, univers);
  const [enrichie] = await enrichirAvecUuid([famille]);
  return enrichie!;
}

/** Existence check pour `familleParenteId` — mirrors `verifierParentExiste`
 * de personne.service.ts. */
async function verifierFamilleParenteExiste(id: number): Promise<Famille> {
  const famille = await familleRepository.findOne({ id, deletedAt: null });
  if (!famille) {
    throw AppError.notFound("Famille parente introuvable.", { field: "familleParenteId" });
  }
  return famille;
}

/** Walks up the `familleParenteId` chain starting at `depuisId` — true si
 * `candidateId` y apparaît. Mirrors `remonteAscendanceContient` de
 * personne.service.ts (Set de visités contre les boucles pré-existantes). */
async function remonteChaineFamilleContient(
  candidateId: number,
  depuisId: number,
): Promise<boolean> {
  let curseurId: number | null = depuisId;
  const visites = new Set<number>();
  while (curseurId !== null) {
    if (curseurId === candidateId) return true;
    if (visites.has(curseurId)) return false;
    visites.add(curseurId);
    const curseur: Famille | null = await familleRepository.findById({ id: curseurId });
    if (!curseur) return false;
    curseurId = curseur.familleParenteId;
  }
  return false;
}

// See personne.service.ts for why this cast is needed (Zod optional vs Prisma
// nullable-field typing under `exactOptionalPropertyTypes`).
export async function creer(input: CreateFamilleInput): Promise<Famille> {
  const parenteRenseignee = input.familleParenteId !== undefined && input.familleParenteId !== null;
  if (parenteRenseignee) {
    await verifierFamilleParenteExiste(input.familleParenteId as number);
  }
  // Posé une seule fois, jamais recalculé ensuite (voir le commentaire sur la
  // colonne dans schema.prisma) : une famille créée sans famille parente est
  // une VRAIE fondatrice, pour toujours — même si elle en gagne une plus
  // tard (ce que le modèle actuel de toute façon n'autorise pas : rien ne
  // rattache jamais une fondatrice à un parent).
  return familleRepository.create({
    ...input,
    estFondatriceOrigine: !parenteRenseignee,
  } as Prisma.FamilleUncheckedCreateInput);
}

export async function modifier(uuid: string, input: UpdateFamilleInput): Promise<Famille> {
  const existante = await obtenirBruteParUuid(uuid);

  const familleParenteActuelle = existante.familleParenteId ?? undefined;
  const nouveauParentId = input.familleParenteId; // number | null (coupure explicite) | undefined (champ non touché)
  const familleParenteChange = nouveauParentId !== familleParenteActuelle;
  if (familleParenteChange && nouveauParentId !== undefined && nouveauParentId !== null) {
    await verifierFamilleParenteExiste(nouveauParentId);
    if (await remonteChaineFamilleContient(existante.id, nouveauParentId)) {
      throw AppError.conflict(CYCLE_ERROR_MESSAGE, { field: "familleParenteId" });
    }
  }

  return familleRepository.update(
    { id: existante.id },
    input as Prisma.FamilleUncheckedUpdateInput,
  );
}

/** Empêche une hiérarchie incohérente : une famille encore rattachée à des
 * personnes actives, ou encore parente d'une famille relative active, ne
 * peut pas être désactivée. Un seul niveau suffit — sans dépendant direct
 * actif, il ne peut par construction rien y avoir plus bas dans la chaîne. */
export async function desactiver(uuid: string): Promise<Famille> {
  const existante = await obtenirBruteParUuid(uuid);

  const personneRattachee = await personneRepository.findOne({
    familleId: existante.id,
    deletedAt: null,
  });
  if (personneRattachee) {
    throw AppError.conflict(
      "Impossible de désactiver cette famille : des personnes actives y sont encore rattachées.",
      { field: "familleId" },
    );
  }

  const familleRelativeActive = await familleRepository.findOne({
    familleParenteId: existante.id,
    deletedAt: null,
  });
  if (familleRelativeActive) {
    throw AppError.conflict(
      "Impossible de désactiver cette famille : une famille relative active en dépend encore.",
      { field: "familleParenteId" },
    );
  }

  return familleRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<Famille> {
  const existante = await obtenirBruteParUuid(uuid);
  return familleRepository.restore({ id: existante.id });
}

/** Familles directement rattachées à celle-ci comme famille parente — un
 * niveau de la hiérarchie (pas de récursion : voir `obtenirChaine` pour la
 * remontée complète jusqu'à la famille fondatrice). */
export async function listerRelatives(
  uuid: string,
  univers: UniversFamilial = "toutes",
): Promise<FamilleAvecUuid[]> {
  const famille = await obtenirBruteParUuid(uuid);
  verifierAccesUnivers(famille.id, univers);
  return enrichirAvecUuid(await familleRepository.trouverRelatives(famille.id));
}

/** Remonte via `familleParenteId` depuis la famille donnée jusqu'à la
 * famille fondatrice (celle dont `familleParenteId` est null) — la famille
 * elle-même en premier, la fondatrice en dernier. Même garde anti-boucle que
 * `remonteChaineFamilleContient` (Set de visités) au cas où une chaîne
 * pré-existante serait corrompue. */
export async function obtenirChaine(
  uuid: string,
  univers: UniversFamilial = "toutes",
): Promise<FamilleAvecUuid[]> {
  const depart = await obtenirBruteParUuid(uuid);
  verifierAccesUnivers(depart.id, univers);
  const chaine: Famille[] = [depart];
  const visites = new Set<number>([depart.id]);
  let curseurId = depart.familleParenteId;
  while (curseurId !== null) {
    if (visites.has(curseurId)) break;
    visites.add(curseurId);
    const suivante = await familleRepository.findById({ id: curseurId });
    if (!suivante) break;
    chaine.push(suivante);
    curseurId = suivante.familleParenteId;
  }
  return enrichirAvecUuid(chaine);
}
