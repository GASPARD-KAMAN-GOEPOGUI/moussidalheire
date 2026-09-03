import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "@/utils/app-error";

export type ValidationTarget = "body" | "params" | "query";

/**
 * Reusable Zod validation middleware: `validate(schema)` or `validate(schema, "query")`.
 * On success, the parsed (and type-coerced/defaulted) value replaces `req[target]` so
 * downstream handlers read trusted, already-shaped data instead of raw input.
 * On failure, forwards a 400 VALIDATION_ERROR carrying the Zod issues — the central
 * error middleware turns that into the standard `{ success: false, error: { ... } }` body.
 */
export function validate(schema: ZodType, target: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(
        AppError.validation(
          result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    if (target === "query") {
      // Express 5 turns `req.query` into a getter-only property (lazy-parsed from
      // the URL) — a plain `req.query = ...` throws. Redefining it as a normal,
      // writable data property is the documented workaround for replacing it.
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[target] = result.data;
    }

    next();
  };
}
