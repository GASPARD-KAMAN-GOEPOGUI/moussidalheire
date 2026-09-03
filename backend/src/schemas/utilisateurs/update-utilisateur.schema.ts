import { z } from "zod";
import {
  identifiantSchema,
  motDePasseSchema,
  optionalEmailSchema,
  personneIdSchema,
} from "./utilisateur.primitives";

/**
 * PUT /api/v1/utilisateurs/:id — full replacement of every modifiable field.
 * `motDePasse` is optional: omit it to keep the current hash unchanged.
 *
 * Deliberately excludes `actif`/`supprime`/`supprimeLe`: those are lifecycle
 * state, only ever changed through POST /:id/desactiver and /:id/reactiver —
 * never as a side effect of an unrelated field edit. `.strict()` rejects any
 * such field outright instead of silently ignoring it.
 */
export const updateUtilisateurSchema = z
  .object({
    identifiant: identifiantSchema,
    email: optionalEmailSchema,
    motDePasse: motDePasseSchema.optional(),
    personneId: personneIdSchema.optional(),
  })
  .strict();

export type UpdateUtilisateurInput = z.infer<typeof updateUtilisateurSchema>;
