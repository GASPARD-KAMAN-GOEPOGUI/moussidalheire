/**
 * Base class for every operational error the app raises on purpose (bad input,
 * missing resource, forbidden action, ...). Thrown/passed-to-`next` from
 * anywhere in routes/controllers/services and caught once, centrally, by
 * error.middleware.ts — call sites never format an HTTP response themselves.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  /** Operational errors are expected/handled; non-operational ones are bugs and get logged louder. */
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, "BAD_REQUEST", details);
  }

  static validation(
    details?: unknown,
    message = "Certaines informations saisies ne sont pas valides. Merci de vérifier le formulaire.",
  ): AppError {
    return new AppError(message, 400, "VALIDATION_ERROR", details);
  }

  static unauthorized(message = "Authentification requise. Veuillez vous reconnecter."): AppError {
    return new AppError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message = "Vous n'avez pas l'autorisation d'effectuer cette action."): AppError {
    return new AppError(message, 403, "FORBIDDEN");
  }

  static notFound(message = "La ressource demandée est introuvable.", details?: unknown): AppError {
    return new AppError(message, 404, "NOT_FOUND", details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(message, 409, "CONFLICT", details);
  }

  static internal(message = "Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants."): AppError {
    return new AppError(message, 500, "INTERNAL_ERROR");
  }
}
