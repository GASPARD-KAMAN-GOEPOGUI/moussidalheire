import type { Response } from "express";
import type { ApiSuccess } from "@/types/api-response";

/**
 * Standardizes the success envelope every controller sends, so it's never
 * hand-built (and never drifts) per controller. Matches the existing
 * convention already established by MODULE 01 (utilisateurs): `{ success,
 * message }` plus whatever fields the endpoint adds at the top level — no
 * `data` wrapper. Error responses are already centralized separately, in
 * middlewares/error.middleware.ts.
 */
export function sendSuccess<TExtra extends object = Record<string, never>>(
  res: Response,
  statusCode: number,
  message: string,
  extra?: TExtra,
): void {
  const body: ApiSuccess = { success: true, message };
  res.status(statusCode).json({ ...body, ...extra });
}
