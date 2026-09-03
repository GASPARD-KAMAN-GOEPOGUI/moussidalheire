import { z } from "zod";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { booleanQueryParamSchema } from "./common.validator";
import { versMajusculesSansAccent } from "@/utils/text";

export const createFamilleSchema = z
  .object({
    // Stockée en majuscules sans accent — "Goépogui"/"goepogui" deviennent
    // tous deux "GOEPOGUI", pour qu'une même lignée ne soit jamais dédoublée
    // à cause d'une simple différence de casse/accent à la saisie.
    nom: z.string().trim().min(1).max(150).transform(versMajusculesSansAccent),
    description: z.string().trim().optional(),
    histoire: z.string().trim().optional(),
    devise: z.string().trim().max(200).optional(),
    imageCouverture: z.string().trim().max(500).optional(),
    ancetreId: z.coerce.number().int().positive().optional(),
    // `.nullable()` en plus de `.optional()` : omis = "ne pas toucher à ce
    // champ" (sémantique déjà en place, ex. modifier() ne touche pas la
    // famille parente si le champ est absent) ; `null` explicite = "couper
    // le rattachement" (voir famille.service.ts::modifier) — un simple
    // nombre positif ne peut représenter aucun des deux, il fallait bien
    // distinguer "absent" de "explicitement effacé".
    familleParenteId: z.coerce.number().int().positive().nullable().optional(),
  })
  .strict();
export type CreateFamilleInput = z.infer<typeof createFamilleSchema>;

export const updateFamilleSchema = createFamilleSchema;
export type UpdateFamilleInput = z.infer<typeof updateFamilleSchema>;

export const listFamilleQuerySchema = paginationQuerySchema.extend({
  // Même normalisation que `nom` à l'écriture, pour que la recherche reste
  // efficace quelle que soit la casse/les accents saisis.
  recherche: z.string().trim().min(1).max(100).transform(versMajusculesSansAccent).optional(),
  inclureSupprimes: booleanQueryParamSchema,
});
export type ListFamilleQuery = z.infer<typeof listFamilleQuerySchema>;
