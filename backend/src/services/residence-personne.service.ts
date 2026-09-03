import type { Prisma } from "@prisma/client";
import { residencePersonneRepository } from "@/repositories/residence-personne.repository";
import type { ResidencePersonne } from "@/models/residence-personne.model";
import type {
  CreateResidencePersonneInput,
  ListResidencePersonneQuery,
  UpdateResidencePersonneInput,
} from "@/validators/residence-personne.validator";
import { verifierPersonneExiste } from "@/services/personne.service";
import { verifierLieuExiste } from "@/services/lieu.service";
import { AppError } from "@/utils/app-error";
import { buildPaginationMeta, toSkipTake, type PaginationMeta } from "@/utils/pagination";

/**
 * Real business rule on top of the generic CRUD: a personne has AT MOST ONE
 * résidence marquée `estActuelle` à la fois — poser `estActuelle: true` sur
 * une résidence désactive automatiquement l'ancienne (jamais deux lignes
 * "actuelles" pour la même personne). L'historique lui-même (plusieurs
 * lignes passées) n'est pas exposé côté frontend pour l'instant — voir
 * `services/api/stats.ts::getResidenceBreakdown` côté frontend — mais reste
 * intact en base pour un usage futur.
 */

export async function lister(
  query: ListResidencePersonneQuery,
): Promise<{ residences: ResidencePersonne[]; pagination: PaginationMeta }> {
  const where: Prisma.ResidencePersonneWhereInput = {
    ...(query.inclureSupprimes ? {} : { deletedAt: null }),
    ...(query.personneId !== undefined ? { personneId: query.personneId } : {}),
    ...(query.lieuId !== undefined ? { lieuId: query.lieuId } : {}),
    ...(query.estActuelle !== undefined ? { estActuelle: query.estActuelle } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [residences, total] = await Promise.all([
    residencePersonneRepository.findAll({ where, skip, take, orderBy: { createdAt: "desc" } }),
    residencePersonneRepository.count(where),
  ]);
  return { residences, pagination: buildPaginationMeta(query, total) };
}

export async function obtenirParUuid(uuid: string): Promise<ResidencePersonne> {
  const residence = await residencePersonneRepository.findOne({ uuid });
  if (!residence) {
    throw AppError.notFound("Résidence introuvable.");
  }
  return residence;
}

/** Unsets `estActuelle` on whichever OTHER résidence is currently flagged
 * current for this personne (`excluId` skips the row being written itself,
 * relevant on update). A no-op if none exists yet. */
async function desactiverAncienneResidenceActuelle(personneId: number, excluId?: number): Promise<void> {
  const actuelle = await residencePersonneRepository.findOne({
    personneId,
    estActuelle: true,
    deletedAt: null,
    ...(excluId !== undefined ? { id: { not: excluId } } : {}),
  });
  if (actuelle) {
    await residencePersonneRepository.update({ id: actuelle.id }, { estActuelle: false });
  }
}

export async function creer(input: CreateResidencePersonneInput): Promise<ResidencePersonne> {
  await verifierPersonneExiste(input.personneId, "personneId");
  await verifierLieuExiste(input.lieuId);
  if (input.estActuelle) {
    await desactiverAncienneResidenceActuelle(input.personneId);
  }
  return residencePersonneRepository.create(input as Prisma.ResidencePersonneUncheckedCreateInput);
}

export async function modifier(
  uuid: string,
  input: UpdateResidencePersonneInput,
): Promise<ResidencePersonne> {
  const existante = await obtenirParUuid(uuid);
  if (input.personneId !== existante.personneId) {
    await verifierPersonneExiste(input.personneId, "personneId");
  }
  if (input.lieuId !== existante.lieuId) {
    await verifierLieuExiste(input.lieuId);
  }
  if (input.estActuelle) {
    await desactiverAncienneResidenceActuelle(input.personneId, existante.id);
  }
  return residencePersonneRepository.update(
    { id: existante.id },
    input as Prisma.ResidencePersonneUncheckedUpdateInput,
  );
}

export async function desactiver(uuid: string): Promise<ResidencePersonne> {
  const existante = await obtenirParUuid(uuid);
  return residencePersonneRepository.softDelete({ id: existante.id });
}

export async function restaurer(uuid: string): Promise<ResidencePersonne> {
  const existante = await obtenirParUuid(uuid);
  return residencePersonneRepository.restore({ id: existante.id });
}
