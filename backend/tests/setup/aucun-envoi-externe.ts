import { vi } from "vitest";

/**
 * Chargé avant chaque fichier de test (voir vitest.config.mts, `setupFiles`).
 *
 * `web-push` est remplacé par un double : aucune notification ne peut partir
 * vers FCM ou Mozilla pendant les tests, même si la base locale contient de
 * vrais abonnements. Les e-mails, eux, sont neutralisés par la configuration
 * (variables SMTP vidées) — pas besoin de simuler nodemailer ici.
 */
vi.mock("web-push");
