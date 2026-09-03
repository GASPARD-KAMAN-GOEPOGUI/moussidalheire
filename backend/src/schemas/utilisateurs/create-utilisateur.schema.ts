import { z } from "zod";
import {
  identifiantSchema,
  motDePasseSchema,
  optionalEmailSchema,
  personneIdSchema,
} from "./utilisateur.primitives";

export const createUtilisateurSchema = z
  .object({
    identifiant: identifiantSchema,
    email: optionalEmailSchema,
    motDePasse: motDePasseSchema,
    personneId: personneIdSchema.optional(),
  })
  .strict();

export type CreateUtilisateurInput = z.infer<typeof createUtilisateurSchema>;
