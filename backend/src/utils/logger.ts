import pino from "pino";
import { env } from "@/config/env";

/**
 * Structured logger, single instance for the whole app. Redact paths cover the
 * shapes most likely to leak secrets through logged request/response objects or
 * error payloads — extend this list before logging any new sensitive field.
 */
// `exactOptionalPropertyTypes` forbids assigning `transport: undefined` — the key
// must be entirely absent outside development, not present-with-undefined.
const transportOption =
  env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {};

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.motDePasse",
      "req.body.token",
      "req.body.jwt",
      "req.body.jwtSecret",
      "*.password",
      "*.motDePasse",
      "*.mot_de_passe_hash",
      "*.motDePasseHash",
      "*.token",
      "*.secret",
      "*.jwt",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
  ...transportOption,
});
