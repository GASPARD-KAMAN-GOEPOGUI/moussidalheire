import type { Utilisateur } from "@/models/utilisateur.model";

/**
 * The only shape of a user ever allowed to leave this process over HTTP.
 * `motDePasseHash` is omitted at the type level, not just "usually left out",
 * so a future field added to the Prisma model can't accidentally leak through
 * a spread (`...utilisateur`) without a compiler error somewhere.
 *
 * `personneUuid` mirrors the `pereUuid`/`mereUuid`/`familleUuid` enrichment
 * already done for `Personne` responses (see `personne.service.ts`) — the
 * frontend only ever addresses a personne by uuid, never by `personneId`, so
 * a client holding a `UtilisateurPublic` (e.g. from `/auth/moi`) needs this
 * to resolve "my own fiche" without a dedicated lookup-by-numeric-id route.
 */
export type UtilisateurPublic = Omit<Utilisateur, "motDePasseHash"> & { personneUuid?: string };

/**
 * Every repository/service function that hands a user back to a controller for an
 * HTTP response must go through this — never return the raw Prisma row directly.
 */
export function toUtilisateurPublic(utilisateur: Utilisateur): UtilisateurPublic {
  const { motDePasseHash: _motDePasseHash, ...utilisateurPublic } = utilisateur;
  return utilisateurPublic;
}
