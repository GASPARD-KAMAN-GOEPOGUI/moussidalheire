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

/**
 * Ce que renvoie la vérification d'un jeton : son contenu, plus sa date
 * d'émission (`iat`, en secondes). Distinct de `JwtPayload`, qui est ce qu'on
 * SIGNE — `emisLe` n'a rien à faire dans un nouveau jeton.
 */
export interface JwtPayloadVerifie extends JwtPayload {
  emisLe: number;
}

/** Jeton temporaire délivré après vérification d'un code de réinitialisation. */
export interface JwtReinitialisation extends JwtPayload {
  /** Identifiant de la ligne `password_reset_tokens` : lie le jeton à un code
   * précis, qui ne sert qu'une fois (voir `utiliseA`). */
  jetonId: string;
}

/**
 * Un jeton émis AVANT la dernière réinitialisation du mot de passe est révoqué.
 *
 * Comparaison à la seconde, la granularité de `iat` : un jeton émis dans la
 * même seconde que la réinitialisation est accepté. Sans ça, une connexion
 * faite juste après (horodatée à la seconde, donc arrondie vers le bas) serait
 * refusée à tort. Le risque inverse — un jeton frauduleux émis dans cette même
 * seconde — est négligeable.
 *
 * `motDePasseModifieLe` nul : compte jamais réinitialisé, rien n'est révoqué.
 * C'est ce qui garantit que les sessions existantes continuent de fonctionner.
 */
export function jetonRevoque(emisLe: number, motDePasseModifieLe: Date | null): boolean {
  if (!motDePasseModifieLe) return false;
  return emisLe < Math.floor(motDePasseModifieLe.getTime() / 1000);
}

/** `iat` est toujours posé par jsonwebtoken. S'il manquait, on le tient pour
 * infiniment ancien : ce jeton serait révoqué dès la première
 * réinitialisation, ce qui est le bon sens de l'erreur. */
function lireEmisLe(decoded: jwt.JwtPayload): number {
  return typeof decoded.iat === "number" ? decoded.iat : 0;
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
export function verifierToken(token: string): JwtPayloadVerifie {
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
      emisLe: lireEmisLe(decoded),
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
export function verifierRefreshToken(token: string): JwtPayloadVerifie {
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
      emisLe: lireEmisLe(decoded),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized("Jeton de rafraîchissement invalide ou expiré.");
  }
}

/** Durée de vie du jeton délivré après vérification du code : le temps de
 * saisir un nouveau mot de passe, pas davantage. */
const DUREE_JETON_REINITIALISATION = "10m";

/**
 * Jeton délivré par `POST /auth/verifier-code`, à présenter à
 * `POST /auth/reinitialiser-mot-de-passe`. Marqué `type: "reset"` : comme
 * `verifierToken` rejette tout jeton portant un `type`, il ne peut jamais
 * servir de jeton d'accès — la même garantie que pour le jeton de
 * rafraîchissement.
 */
export function signerTokenReinitialisation(payload: JwtReinitialisation): string {
  return jwt.sign({ ...payload, type: "reset" }, env.JWT_SECRET, {
    expiresIn: DUREE_JETON_REINITIALISATION,
  });
}

/**
 * Lève un 400 et non un 401 : ce jeton ne correspond à aucune session. Un 401
 * pousserait le frontend à tenter un rafraîchissement de session automatique
 * (voir api-client.ts), sans aucun sens ici.
 */
export function verifierTokenReinitialisation(token: string): JwtReinitialisation {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded === "string" ||
      typeof decoded.utilisateurId !== "number" ||
      typeof decoded.utilisateurUuid !== "string" ||
      typeof decoded.jetonId !== "string" ||
      decoded.type !== "reset"
    ) {
      throw AppError.badRequest("Ce lien de réinitialisation n'est pas valide.");
    }
    return {
      utilisateurId: decoded.utilisateurId,
      utilisateurUuid: decoded.utilisateurUuid,
      jetonId: decoded.jetonId,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest(
      "Ce lien de réinitialisation a expiré. Recommencez la procédure depuis le début.",
    );
  }
}
