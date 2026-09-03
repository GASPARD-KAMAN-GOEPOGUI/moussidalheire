import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { AppError } from "@/utils/app-error";
import type { ApiError } from "@/types/api-response";

function respond(
  res: Response,
  statusCode: number,
  message: string,
  code: string,
  details?: unknown,
): void {
  const body: ApiError = {
    success: false,
    message,
    error: {
      code,
      // Never leak internal details (stack traces, raw DB errors) in production.
      ...(details !== undefined && env.NODE_ENV !== "production" ? { details } : {}),
    },
  };
  res.status(statusCode).json(body);
}

/**
 * Single place every thrown/forwarded error in the app ends up. Must be registered
 * last, after all routes and the 404 handler — Express recognizes it as an error
 * handler purely by its 4-argument signature.
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, "Non-operational AppError");
    }
    respond(res, err.statusCode, err.message, err.code, err.details);
    return;
  }

  if (err instanceof ZodError) {
    respond(
      res,
      400,
      "Certaines informations saisies ne sont pas valides. Merci de vérifier le formulaire.",
      "VALIDATION_ERROR",
      err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error({ err }, "Prisma known request error");
    // Prisma error codes/messages can reveal schema/column names — never forwarded as-is.
    respond(
      res,
      400,
      "Cette opération n'a pas pu être effectuée car elle entre en conflit avec des données existantes.",
      "DATABASE_ERROR",
    );
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err }, "Prisma validation error");
    respond(
      res,
      400,
      "Certaines informations envoyées sont invalides. Merci de réessayer.",
      "DATABASE_VALIDATION_ERROR",
    );
    return;
  }

  // Unexpected/programmer error — always logged with full detail server-side,
  // never exposed to the client beyond a generic message.
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  respond(res, 500, "Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.", "INTERNAL_ERROR");
}
