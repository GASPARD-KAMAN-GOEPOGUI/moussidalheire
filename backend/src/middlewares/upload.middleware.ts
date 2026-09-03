import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer, { MulterError } from "multer";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/app-error";

/**
 * Minimal photo upload — disk storage under `storage/photos/`, a random
 * filename per upload (never the client-supplied name, avoiding path
 * traversal/collisions), and the same 5 Mo cap `ProfilePhotoField.tsx`
 * already enforces client-side. No image processing/resizing: out of scope
 * for "the strict minimum needed."
 *
 * Public route (see `routes/upload.routes.ts`, mounted without `requireAuth`)
 * — self-registration (`NewMemberDialog`) uploads a photo for père/mère/
 * fratrie/conjoint/enfant *before* any account exists, exactly like
 * `POST /auth/inscription` itself is public. The global `apiLimiter`
 * (app.ts), the size cap, and the MIME whitelist below are this endpoint's
 * only abuse protections — proportionate to a village-scale registry, not a
 * public file host.
 */
export const PHOTOS_DIR = path.join(process.cwd(), "storage", "photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PHOTOS_DIR),
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXTENSION_BY_MIME[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype in EXTENSION_BY_MIME);
  },
}).single("photo");

/** Wraps multer's callback-style middleware so every failure (oversize,
 * wrong field name, malformed multipart) reaches the app's own error
 * middleware as an `AppError` — never an unhandled 500 — and so an
 * unsupported image type (rejected by `fileFilter` above, which signals
 * rejection by simply not accepting the file rather than erroring) is
 * still reported clearly instead of silently proceeding with no file. */
export function uploadPhoto(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(AppError.badRequest("L'image ne doit pas dépasser 5 Mo."));
        return;
      }
      next(AppError.badRequest(err.message));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    if (!req.file) {
      next(AppError.badRequest("Aucune image valide reçue (formats acceptés : JPG, PNG, WebP)."));
      return;
    }
    next();
  });
}
