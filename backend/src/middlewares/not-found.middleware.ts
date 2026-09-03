import type { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/app-error";
import { logger } from "@/utils/logger";

/**
 * Registered after every route. Express 5's path-to-regexp no longer accepts a bare
 * `"*"` route pattern, so this is a path-less catch-all middleware instead of
 * `app.use("*", ...)` — it only runs when nothing earlier matched. The technical
 * route/method only ever goes to the logs — the client gets `AppError.notFound()`'s
 * generic human message, never a raw `Route not found: GET /...` string.
 */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  logger.warn({ method: req.method, path: req.originalUrl }, "Route not found");
  next(AppError.notFound());
}
