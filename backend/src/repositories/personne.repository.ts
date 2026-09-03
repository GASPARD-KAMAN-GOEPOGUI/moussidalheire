import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { SoftDeletableRepository } from "@/repositories/base.repository";
import type { Personne } from "@/models/personne.model";

/**
 * `PersonneRepository extends SoftDeletableRepository` — the generic CRUD
 * (create/findById/findOne/findAll/update/softDelete/restore/exists/count)
 * is never rewritten here. Domain-specific queries (recherche par famille,
 * par père/mère, recherche généalogique, ...) will be added as extra methods
 * on this class in a future phase — none exist yet, on purpose.
 */
export class PersonneRepository extends SoftDeletableRepository<
  Personne,
  Prisma.PersonneWhereUniqueInput,
  Prisma.PersonneWhereInput,
  // "Unchecked" variants: flat scalar foreign keys (`familleId: number`, ...)
  // rather than nested `{ famille: { connect: { id } } }` — matches the flat
  // shape validators produce, with zero relation-specific logic in this
  // generic layer.
  Prisma.PersonneUncheckedCreateInput,
  Prisma.PersonneUncheckedUpdateInput,
  Prisma.PersonneOrderByWithRelationInput
> {
  constructor() {
    super(prisma.personne);
  }

  /**
   * Highest numeric suffix among existing matricules (format `MSD-000001`),
   * across every row regardless of `actif`/`deletedAt` — a matricule is never
   * reused, even for a deactivated person. Returns 0 if none exist yet.
   * A raw query is used because "extract the numeric suffix and take the max"
   * has no equivalent in Prisma's query builder.
   */
  async trouverMatriculeMaxNumero(): Promise<number> {
    const rows = await prisma.$queryRaw<{ maxNumero: bigint | null }[]>`
      SELECT MAX(CAST(SUBSTRING(matricule, 5) AS UNSIGNED)) AS maxNumero
      FROM personnes
      WHERE matricule REGEXP '^MSD-[0-9]+$'
    `;
    const maxNumero = rows[0]?.maxNumero;
    return maxNumero === null || maxNumero === undefined ? 0 : Number(maxNumero);
  }

  /** Union of "children where this person is the father" and "... the mother". */
  trouverEnfants(personneId: number): Promise<Personne[]> {
    return prisma.personne.findMany({
      where: { OR: [{ pereId: personneId }, { mereId: personneId }] },
      orderBy: { createdAt: "asc" },
    });
  }

  /** People who share the same father or the same mother as `personneId` —
   * siblings are never stored, always derived from `pereId`/`mereId`. */
  trouverFratrie(
    personneId: number,
    pereId: number | null,
    mereId: number | null,
  ): Promise<Personne[]> {
    if (!pereId && !mereId) return Promise.resolve([]);
    return prisma.personne.findMany({
      where: {
        id: { not: personneId },
        OR: [...(pereId ? [{ pereId }] : []), ...(mereId ? [{ mereId }] : [])],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** People related to `personneId` via `unions` (either side) — spouses are
   * never stored on `Personne`, always derived from the `Union` table. */
  async trouverConjoints(personneId: number): Promise<Personne[]> {
    const unions = await prisma.union.findMany({
      where: {
        deletedAt: null,
        OR: [{ epouxId: personneId }, { epouseId: personneId }],
      },
      select: { epouxId: true, epouseId: true },
    });
    const conjointIds = unions
      .map((u) => (u.epouxId === personneId ? u.epouseId : u.epouxId))
      .filter((id, index, all) => all.indexOf(id) === index);
    if (conjointIds.length === 0) return [];
    return prisma.personne.findMany({ where: { id: { in: conjointIds } } });
  }

  /**
   * Fiches dont le téléphone pourrait être une autre écriture du numéro
   * saisi, présélectionnées sur leurs 8 derniers chiffres. Sert à la
   * connexion par téléphone : la colonne contient les numéros exactement tels
   * qu'ils ont été saisis, donc des formes hétérogènes pour les fiches
   * antérieures à la règle de saisie ("620 00 00 00", "+224-620-00-00-00"),
   * qu'une égalité stricte ne rapprocherait jamais du numéro tapé.
   *
   * Le tri final n'est PAS fait ici : les 8 derniers chiffres ne sont qu'un
   * filtre grossier, l'appelant confirme chaque candidat avec `memeNumero`
   * (voir `utils/telephone.ts`). Découpage volontaire — cette présélection
   * réduit le balayage à quelques lignes, la règle d'équivalence reste écrite
   * une seule fois, en TypeScript, testable sans base de données.
   *
   * Les séparateurs sont retirés par `REPLACE` imbriqués plutôt que par
   * `REGEXP_REPLACE`, absent avant MySQL 8.0 — la requête reste valable quelle
   * que soit la version servant l'application. Aucun index ne peut servir ici
   * (la colonne est transformée avant comparaison) : c'est un balayage, admis
   * parce qu'il n'a lieu qu'au second essai d'une connexion par téléphone,
   * jamais sur le chemin nominal ni sur une requête authentifiée.
   */
  trouverCandidatsParTelephone(
    huitDerniersChiffres: string,
  ): Promise<{ id: number; telephone: string | null }[]> {
    return prisma.$queryRaw<{ id: number; telephone: string | null }[]>`
      SELECT id, telephone
      FROM personnes
      WHERE deleted_at IS NULL
        AND telephone IS NOT NULL
        AND RIGHT(
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            telephone, ' ', ''), '+', ''), '-', ''), '.', ''), '(', ''), ')', ''), '/', ''),
          8
        ) = ${huitDerniersChiffres}
    `;
  }
}

export const personneRepository = new PersonneRepository();

/**
 * The one write this repository exposes outside the `PersonneRepository`
 * class: creating a personne against a caller-supplied Prisma client instead
 * of the module-global `prisma` singleton. Used wherever a personne and its
 * linked utilisateur must be created atomically inside one
 * `prisma.$transaction` — auth.service.ts's inscription flow, and
 * personne.service.ts::creerEnfantConnecte ("Ajouter mes enfants"). This
 * repository is still the only thing that calls `client.personne.*`, the
 * transaction's `tx` client is just passed in rather than assumed.
 */
export function creerAvecClient(
  client: Prisma.TransactionClient,
  data: Prisma.PersonneUncheckedCreateInput,
): Promise<Personne> {
  return client.personne.create({ data });
}

/**
 * The transactional counterpart of `creerAvecClient` for updates — needed by
 * auth.service.ts to retroactively attach an already-existing personne
 * (selected as fratrie/enfant) to the père/mère resolved during this same
 * registration, without leaving the single `prisma.$transaction`.
 */
export function mettreAJourAvecClient(
  client: Prisma.TransactionClient,
  where: Prisma.PersonneWhereUniqueInput,
  data: Prisma.PersonneUncheckedUpdateInput,
): Promise<Personne> {
  return client.personne.update({ where, data });
}

/**
 * Batch variant of `mettreAJourAvecClient` — used by auth.service.ts to
 * retroactively stamp every personne created during a single self-registration
 * (père/mère/fratrie/conjoint(s)/enfants) with the newly-created membre's own
 * utilisateur id, once it exists (see `Personne.creeParUtilisateurId`) —
 * one query for the whole batch rather than one update per personne.
 */
export function mettreAJourPlusieursAvecClient(
  client: Prisma.TransactionClient,
  where: Prisma.PersonneWhereInput,
  data: Prisma.PersonneUncheckedUpdateManyInput,
): Promise<Prisma.BatchPayload> {
  return client.personne.updateMany({ where, data });
}
