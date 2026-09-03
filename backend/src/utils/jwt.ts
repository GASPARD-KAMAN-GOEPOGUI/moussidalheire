import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { AppError } from "@/utils/app-error";

/**
 * Everything this app's JWTs carry: enough to identify the account and, once
 * verified, look it up again — never the password hash, never anything else
 * sensitive (a JWT payload is base64, not encrypted; anyone holding the token
 * can read it).
 */
export interface JwtPayload {
  utilisateurId: number;
  utilisateurUuid: string;
}

// `env.JWT_EXPIRES_IN`/`env.JWT_REFRESH_EXPIRES_IN` are validated,
// always-present strings (zod defaults) — the cast only narrows
// jsonwebtoken's own union type down from `... | undefined`, which
// `exactOptionalPropertyTypes` otherwise rejects for a key that's genuinely
// always supplied here.
type ExpiresIn = Exclude<jwt.SignOptions["expiresIn"], undefined>;

export function signerToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as ExpiresIn });
}

/** Throws AppError.unauthorized on a missing, malformed, expired, or
 * bad-signature token — callers never need to distinguish jsonwebtoken's own
 * error subclasses. Rejects a refresh token presented here (see `type` below):
 * the two are never interchangeable. */
export function verifierToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded === "string" ||
      !("utilisateurId" in decoded) ||
      !("utilisateurUuid" in decoded) ||
      "type" in decoded
    ) {
      throw AppError.unauthorized("Jeton invalide.");
    }
    return {
      utilisateurId: decoded.utilisateurId as number,
      utilisateurUuid: decoded.utilisateurUuid as string,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized("Jeton invalide ou expiré.");
  }
}

/**
 * Long-lived companion to `signerToken` — exchanged at `POST /auth/refresh`
 * for a fresh access token (see auth.service.ts::rafraichir) once the short
 * access token has expired, so an active user never has to re-enter their
 * mot de passe just because a request landed a minute after expiry. Marked
 * with `type: "refresh"` so a refresh token can never be replayed as an
 * access token (or vice versa) even though both are signed with the same
 * secret — `verifierToken` above explicitly rejects any payload carrying
 * `type`.
 */
export function signerRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as ExpiresIn,
  });
}

/** Throws AppError.unauthorized on a missing, malformed, expired,
 * bad-signature, or non-refresh token (e.g. an access token presented here). */
export function verifierRefreshToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded === "string" ||
      !("utilisateurId" in decoded) ||
      !("utilisateurUuid" in decoded) ||
      decoded.type !== "refresh"
    ) {
      throw AppError.unauthorized("Jeton de rafraîchissement invalide.");
    }
    return {
      utilisateurId: decoded.utilisateurId as number,
      utilisateurUuid: decoded.utilisateurUuid as string,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized("Jeton de rafraîchissement invalide ou expiré.");
  }
}
