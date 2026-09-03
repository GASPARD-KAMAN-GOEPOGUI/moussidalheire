import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import type { Utilisateur } from "@/models/utilisateur.model";

/**
 * The only module allowed to call `prisma.utilisateur.*`. No business rules here
 * (uniqueness checks, password hashing, lifecycle transitions live in
 * services/utilisateurs.service.ts) — just typed reads/writes.
 *
 * No `.delete()`/`.deleteMany()` is used anywhere in this file, deliberately: this
 * table never loses a row through the application. Lifecycle changes go through
 * `setEtatCompte` (UPDATE), never a physical delete.
 */

export interface CreerUtilisateurData {
  identifiant: string;
  email?: string;
  motDePasseHash: string;
  personneId?: number;
}

export interface ModifierUtilisateurData {
  identifiant: string;
  email: string | null;
  motDePasseHash?: string;
  personneId: number | null;
}

export interface EtatCompteData {
  actif: boolean;
  supprime: boolean;
  supprimeLe: Date | null;
}

export interface ListerUtilisateursParams {
  skip: number;
  take: number;
  where: Prisma.UtilisateurWhereInput;
  orderBy: Prisma.UtilisateurOrderByWithRelationInput;
}

export function creer(data: CreerUtilisateurData): Promise<Utilisateur> {
  return prisma.utilisateur.create({ data });
}

export function trouverParId(id: number): Promise<Utilisateur | null> {
  return prisma.utilisateur.findUnique({ where: { id } });
}

export function trouverParUuid(uuid: string): Promise<Utilisateur | null> {
  return prisma.utilisateur.findUnique({ where: { uuid } });
}

export function trouverParIdentifiant(identifiant: string): Promise<Utilisateur | null> {
  return prisma.utilisateur.findUnique({ where: { identifiant } });
}

export function trouverParEmail(email: string): Promise<Utilisateur | null> {
  return prisma.utilisateur.findUnique({ where: { email } });
}

/** `personneId` is `@unique` (one account per personne, at most) — used to
 * resolve a login by matricule/téléphone: the caller finds the `Personne`
 * first (see personne.service.ts::trouverParMatriculeOuTelephone), then
 * looks up its linked account here. */
export function trouverParPersonneId(personneId: number): Promise<Utilisateur | null> {
  return prisma.utilisateur.findUnique({ where: { personneId } });
}

/** Login accepts either the `identifiant` or the `email` in the same field —
 * this is the one lookup that needs both, tried in order. */
export async function trouverParIdentifiantOuEmail(valeur: string): Promise<Utilisateur | null> {
  return (await trouverParIdentifiant(valeur)) ?? trouverParEmail(valeur);
}

/**
 * The one write this repository exposes outside the module-global `prisma`
 * singleton: creating an utilisateur against a caller-supplied Prisma client.
 * Used wherever a personne and its linked utilisateur must be created
 * atomically inside one `prisma.$transaction` — auth.service.ts's inscription
 * flow, and personne.service.ts::creerEnfantConnecte ("Ajouter mes enfants").
 * This repository is still the only thing that calls `client.utilisateur.*`,
 * the transaction's `tx` client is just passed in.
 */
export function creerAvecClient(
  client: Prisma.TransactionClient,
  data: CreerUtilisateurData,
): Promise<Utilisateur> {
  return client.utilisateur.create({ data });
}

export async function lister(
  params: ListerUtilisateursParams,
): Promise<{ utilisateurs: Utilisateur[]; total: number }> {
  const { skip, take, where, orderBy } = params;
  const [utilisateurs, total] = await Promise.all([
    prisma.utilisateur.findMany({ skip, take, where, orderBy }),
    prisma.utilisateur.count({ where }),
  ]);
  return { utilisateurs, total };
}

export function modifier(id: number, data: ModifierUtilisateurData): Promise<Utilisateur> {
  return prisma.utilisateur.update({ where: { id }, data });
}

/** Narrower than `modifier` — touches only `motDePasseHash`, never
 * identifiant/email/personneId. Used by the self-service "changer mon mot de
 * passe" flow (see auth.service.ts::changerMotDePasse), which must never risk
 * overwriting an unrelated field. */
export function mettreAJourMotDePasse(id: number, motDePasseHash: string): Promise<Utilisateur> {
  return prisma.utilisateur.update({ where: { id }, data: { motDePasseHash } });
}

export function definirEtatCompte(id: number, data: EtatCompteData): Promise<Utilisateur> {
  return prisma.utilisateur.update({ where: { id }, data });
}
