import type { Request, Response } from "express";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";

/**
 * `req.file` is guaranteed present — `uploadPhoto` (upload.middleware.ts)
 * already rejects the request before this handler runs otherwise. Builds an
 * absolute URL from the request itself (no new env var): `app.set("trust
 * proxy", 1)` already makes `req.protocol`/`req.get("host")` reflect the
 * public-facing host behind a reverse proxy, exactly as the rate limiter
 * relies on for `req.ip`.
 */
export function televerserPhoto(req: Request, res: Response): void {
  if (!req.file) {
    throw AppError.badRequest("Aucune image reçue.");
  }
  const url = `${req.protocol}://${req.get("host")}/storage/photos/${req.file.filename}`;
  sendSuccess(res, 201, "Photo téléversée avec succès.", { url });
}
