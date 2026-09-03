import { Router } from "express";
import { uploadPhoto } from "@/middlewares/upload.middleware";
import { televerserPhoto } from "@/controllers/upload.controller";

/**
 * Public (no `requireAuth`) — self-registration (`NewMemberDialog`) must be
 * able to attach a photo to père/mère/fratrie/conjoint/enfant before any
 * compte exists, exactly like `POST /auth/inscription` itself. See
 * `upload.middleware.ts` for the abuse protections this relies on instead.
 */
export const uploadRouter = Router();

/**
 * @openapi
 * /uploads/photo:
 *   post:
 *     summary: Téléverser une photo de profil (JPG/PNG/WebP, 5 Mo max) — renvoie son URL
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [photo]
 *             properties:
 *               photo: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Photo enregistrée, url renvoyée pour le champ `photo` d'une personne.
 *       400:
 *         description: Fichier manquant, trop volumineux, ou format non supporté.
 */
uploadRouter.post("/photo", uploadPhoto, televerserPhoto);
