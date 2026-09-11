import type { NextFunction, Request, Response } from "express";
import { jetonRevoque, verifierToken } from "@/utils/jwt";
import { obtenirUtilisateurPourAuthentification } from "@/services/utilisateurs.service";
import { AppError } from "@/utils/app-error";
import type { UtilisateurPublic } from "@/types/utilisateur";

declare global {
  // A `namespace` is the only syntax TypeScript accepts for augmenting a
  // third-party ambient namespace (Express's own `Request` type) — not a
  // stylistic choice ESLint's `no-namespace` rule is meant to catch here.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth` once the bearer token is verified — the full
       * public utilisateur record, never `motDePasseHash`. */
      utilisateur?: UtilisateurPublic;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

/** Message renvoyé à un jeton émis avant la dernière réinitialisation. */
const MESSAGE_SESSION_REVOQUEE =
  "Votre mot de passe a été réinitialisé : cette session n'est plus valide. Veuillez vous reconnecter.";

/**
 * Verifies `Authorization: Bearer <token>`, loads the corresponding
 * utilisateur, and attaches it to `req.utilisateur`. 401 on a missing header,
 * a malformed/expired/bad-signature token, or an utilisateur that no longer
 * exists/is deactivated (a valid token for a since-deactivated account must
 * not keep working).
 *
 * 401 également pour un jeton émis avant la dernière réinitialisation du mot
 * de passe (voir `jetonRevoque`) : c'est ce qui déconnecte un éventuel intrus.
 * Un compte jamais réinitialisé n'est pas concerné, ses jetons passent comme
 * avant. Le frontend, sur ce 401, tente un rafraîchissement — lui aussi refusé
 * (voir auth.service.ts::rafraichir) — puis déconnecte.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    next(AppError.unauthorized("Authentification requise."));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length);

  try {
    const payload = verifierToken(token);
    const { utilisateur, motDePasseModifieLe } = await obtenirUtilisateurPourAuthentification(
      payload.utilisateurId,
    );
    if (!utilisateur.actif || utilisateur.supprime) {
      next(AppError.unauthorized("Ce compte est désactivé."));
      return;
    }
    if (jetonRevoque(payload.emisLe, motDePasseModifieLe)) {
      next(AppError.unauthorized(MESSAGE_SESSION_REVOQUEE));
      return;
    }
    req.utilisateur = utilisateur;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Same verification as `requireAuth`, but never rejects the request — a
 * missing header, an expired/malformed token, or a deleted/deactivated
 * utilisateur all just leave `req.utilisateur` undefined and let the route
 * proceed. For routes that must keep working without a token (e.g. the
 * public self-registration family picker) while still offering a
 * personalized/restricted view when a valid token *is* present.
 */
export async function attachUtilisateurSiPresent(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    next();
    return;
  }

  try {
    const payload = verifierToken(header.slice(BEARER_PREFIX.length));
    const { utilisateur, motDePasseModifieLe } = await obtenirUtilisateurPourAuthentification(
      payload.utilisateurId,
    );
    // Un jeton révoqué est traité comme une absence de jeton : la route reste
    // accessible, mais sans la vue personnalisée.
    if (
      utilisateur.actif &&
      !utilisateur.supprime &&
      !jetonRevoque(payload.emisLe, motDePasseModifieLe)
    ) {
      req.utilisateur = utilisateur;
    }
  } catch {
    // Token invalide/expiré/compte introuvable sur une route qui fonctionne
    // aussi sans authentification — on l'ignore silencieusement.
  }
  next();
}

/**
 * À utiliser après `requireAuth` (jamais seul — suppose `req.utilisateur`
 * déjà attaché). 403 si le rôle ne correspond pas.
 */
export function requireRole(role: UtilisateurPublic["role"]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.utilisateur?.role !== role) {
      next(AppError.forbidden("Action réservée aux administrateurs."));
      return;
    }
    next();
  };
}
