import { Prisma } from "@prisma/client";
import * as utilisateursRepository from "@/repositories/utilisateurs.repository";
import { AppError } from "@/utils/app-error";
import { hacherMotDePasse } from "@/utils/password";
import type { Utilisateur } from "@/models/utilisateur.model";
import { toUtilisateurPublic, type UtilisateurPublic } from "@/types/utilisateur";
import type { CreateUtilisateurInput } from "@/schemas/utilisateurs/create-utilisateur.schema";
import type { UpdateUtilisateurInput } from "@/schemas/utilisateurs/update-utilisateur.schema";
import type { ListUtilisateursQuery } from "@/schemas/utilisateurs/list-utilisateurs.schema";

/**
 * All business rules for `utilisateurs` live here — controllers only call these
 * functions and shape the HTTP response; repositories only talk to Prisma.
 *
 * No `prisma.$transaction` is used in this file on purpose: every operation below
 * maps to exactly one Prisma write (a single `create`/`update`), which MySQL already
 * executes atomically. A transaction earns its place once a business rule genuinely
 * spans multiple dependent writes (e.g. a future "create utilisateur + personne
 * together" flow) — wrapping a single write in one now would add complexity without
 * making anything safer.
 */

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const MESSAGE_PAR_CHAMP_UNIQUE: Record<string, string> = {
  identifiant: "Cet identifiant est déjà utilisé.",
  email: "Cette adresse e-mail est déjà utilisée.",
  uuid: "Ce compte existe déjà.",
};

/**
 * Last line of defense against a race between the pre-flight uniqueness checks
 * below and the actual INSERT/UPDATE (two concurrent requests can both pass the
 * pre-check before either commits). Always throws — never returns.
 */
function leverErreurConflitUnicite(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const cible = error.meta?.target;
    const champ = Array.isArray(cible) ? (cible[0] as string | undefined) : undefined;
    throw AppError.conflict(
      (champ && MESSAGE_PAR_CHAMP_UNIQUE[champ]) ?? "Cette valeur est déjà utilisée.",
      { field: champ },
    );
  }
  throw error;
}

async function trouverOuLeverErreur(uuid: string): Promise<Utilisateur> {
  const utilisateur = await utilisateursRepository.trouverParUuid(uuid);
  if (!utilisateur) {
    throw AppError.notFound("Utilisateur introuvable.");
  }
  return utilisateur;
}

export async function creerUtilisateur(input: CreateUtilisateurInput): Promise<UtilisateurPublic> {
  const identifiantExistant = await utilisateursRepository.trouverParIdentifiant(input.identifiant);
  if (identifiantExistant) {
    throw AppError.conflict("Cet identifiant est déjà utilisé.", { field: "identifiant" });
  }

  if (input.email) {
    const emailExistant = await utilisateursRepository.trouverParEmail(input.email);
    if (emailExistant) {
      throw AppError.conflict("Cette adresse e-mail est déjà utilisée.", { field: "email" });
    }
  }

  // personneId is only structurally validated (positive integer) at this stage — the
  // `personnes` module/table doesn't exist yet, so its *existence* can't be checked.
  // See the `personneId` doc comment on the Prisma model for the full rationale.
  const motDePasseHash = await hacherMotDePasse(input.motDePasse);

  try {
    const utilisateur = await utilisateursRepository.creer({
      identifiant: input.identifiant,
      motDePasseHash,
      ...(input.email ? { email: input.email } : {}),
      ...(input.personneId !== undefined ? { personneId: input.personneId } : {}),
    });
    return toUtilisateurPublic(utilisateur);
  } catch (error) {
    leverErreurConflitUnicite(error);
  }
}

export async function obtenirUtilisateurParUuid(uuid: string): Promise<UtilisateurPublic> {
  return toUtilisateurPublic(await trouverOuLeverErreur(uuid));
}

/** Internal-facing lookup by the numeric primary key — never routed publicly (see
 * the `id`/`uuid` split on the Prisma model). Kept for future modules that hold a
 * `personneId`-style internal FK rather than a uuid. */
export async function obtenirUtilisateurParId(id: number): Promise<UtilisateurPublic> {
  const utilisateur = await utilisateursRepository.trouverParId(id);
  if (!utilisateur) {
    throw AppError.notFound("Utilisateur introuvable.");
  }
  return toUtilisateurPublic(utilisateur);
}

export async function listerUtilisateurs(
  query: ListUtilisateursQuery,
): Promise<{ utilisateurs: UtilisateurPublic[]; pagination: Pagination }> {
  const where: Prisma.UtilisateurWhereInput = {
    ...(query.inclureSupprimes ? {} : { supprime: false }),
    ...(query.actif !== undefined ? { actif: query.actif } : {}),
    ...(query.recherche
      ? {
          OR: [
            { identifiant: { contains: query.recherche } },
            { email: { contains: query.recherche } },
          ],
        }
      : {}),
  };

  const { utilisateurs, total } = await utilisateursRepository.lister({
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    where,
    orderBy: { createdAt: "desc" },
  });

  return {
    utilisateurs: utilisateurs.map(toUtilisateurPublic),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function modifierUtilisateur(
  uuid: string,
  input: UpdateUtilisateurInput,
): Promise<UtilisateurPublic> {
  const existant = await trouverOuLeverErreur(uuid);

  // A deactivated/logically-deleted account must be reactivated before it can be
  // edited — an edit must never be the thing that silently revives it.
  if (existant.supprime) {
    throw AppError.conflict("Cet utilisateur est désactivé ; réactivez-le avant de le modifier.");
  }

  if (input.identifiant !== existant.identifiant) {
    const identifiantExistant = await utilisateursRepository.trouverParIdentifiant(
      input.identifiant,
    );
    if (identifiantExistant) {
      throw AppError.conflict("Cet identifiant est déjà utilisé.", { field: "identifiant" });
    }
  }

  if (input.email && input.email !== existant.email) {
    const emailExistant = await utilisateursRepository.trouverParEmail(input.email);
    if (emailExistant) {
      throw AppError.conflict("Cette adresse e-mail est déjà utilisée.", { field: "email" });
    }
  }

  const motDePasseHash = input.motDePasse ? await hacherMotDePasse(input.motDePasse) : undefined;

  try {
    const utilisateur = await utilisateursRepository.modifier(existant.id, {
      identifiant: input.identifiant,
      email: input.email ?? null,
      personneId: input.personneId ?? null,
      ...(motDePasseHash ? { motDePasseHash } : {}),
    });
    return toUtilisateurPublic(utilisateur);
  } catch (error) {
    leverErreurConflitUnicite(error);
  }
}

/**
 * The sole "delete" this module exposes, and it is not a delete: sets
 * actif=false + supprime=true + supprimeLe=now() in a single UPDATE. The row,
 * its uuid and its whole history stay in the table forever — see the Prisma
 * model doc comment for why `actif`/`supprime` are treated as one unified
 * lifecycle state in this module rather than two independent flags.
 */
export async function desactiverUtilisateur(uuid: string): Promise<UtilisateurPublic> {
  const existant = await trouverOuLeverErreur(uuid);
  if (existant.supprime) {
    throw AppError.conflict("Cet utilisateur est déjà désactivé.");
  }
  const utilisateur = await utilisateursRepository.definirEtatCompte(existant.id, {
    actif: false,
    supprime: true,
    supprimeLe: new Date(),
  });
  return toUtilisateurPublic(utilisateur);
}

/** Restores a previously deactivated account in place — never creates a new row. */
export async function reactiverUtilisateur(uuid: string): Promise<UtilisateurPublic> {
  const existant = await trouverOuLeverErreur(uuid);
  if (!existant.supprime) {
    throw AppError.conflict("Cet utilisateur est déjà actif.");
  }
  const utilisateur = await utilisateursRepository.definirEtatCompte(existant.id, {
    actif: true,
    supprime: false,
    supprimeLe: null,
  });
  return toUtilisateurPublic(utilisateur);
}
