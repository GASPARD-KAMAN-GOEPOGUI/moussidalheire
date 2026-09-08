import "dotenv/config";
import { z } from "zod";

/**
 * Every environment variable the app depends on is declared and validated here,
 * once, at startup. Nothing downstream should read `process.env` directly —
 * import `env` instead, so a missing/malformed variable fails loudly at boot
 * instead of surfacing as an obscure runtime bug later.
 */

/** Treats an empty-string env value the same as an absent one before handing
 * it to `schema`, then makes the whole thing optional. dotenv parses
 * `KEY=` as `""`, not "key absent" — without this, a genuinely optional
 * variable left blank in `.env` (as `.env.example` ships it) would fail
 * validation instead of being treated as unset. */
function emptyToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

/** Longueur en octets d'une chaîne base64url, ou -1 si elle n'est pas décodable. */
function longueurBase64Url(valeur: string): number {
  if (!/^[A-Za-z0-9_-]+$/.test(valeur)) return -1;
  return Buffer.from(valeur, "base64url").length;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z.coerce.number().int().positive("DB_PORT is required"),
  DB_NAME: z.string().min(1, "DB_NAME is required"),
  DB_USER: z.string().min(1, "DB_USER is required"),
  DB_PASSWORD: z.string({ message: "DB_PASSWORD is required" }),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  // Access token: kept short — it's the one attached to every request, so a
  // stolen one has a small blast radius. Never noticed by an active user:
  // POST /auth/refresh (see jwt.ts::signerRefreshToken) silently renews it in
  // the background before it can cause a visible "session expirée" error.
  JWT_EXPIRES_IN: z.string().min(1).default("15m"),
  // Refresh token: long-lived — as long as the user opens the app at least
  // once within this window, they never see an expired-session error. Reissued
  // with a fresh expiry on every successful refresh (sliding window), so a
  // genuinely active user is, in practice, never logged out involuntarily.
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("30d"),

  // Liste d'origines séparées par des virgules — le frontend tourne sur 5173
  // en dev mais sur 4173 en `vite preview`, et les deux doivent pouvoir
  // appeler l'API. Découpée ici en tableau, la seule forme que `cors()`
  // accepte pour autoriser plusieurs origines (une chaîne contenant des
  // virgules serait renvoyée telle quelle dans Access-Control-Allow-Origin,
  // en-tête invalide qu'aucun navigateur ne ferait correspondre).
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default("http://localhost:5173")
    .transform((valeur) =>
      valeur
        .split(",")
        .map((origine) => origine.trim())
        .filter((origine) => origine.length > 0),
    )
    .refine((origines) => origines.length > 0, {
      message: "CORS_ORIGIN must list at least one origin",
    }),

  // URL publique du frontend, utilisée pour construire les liens des e-mails
  // (voir email.service.ts). Distincte de CORS_ORIGIN depuis que celui-ci est
  // une liste : concaténer un tableau dans une URL donnerait un lien cassé.
  // Optionnelle — voir le repli appliqué dans le transform ci-dessous.
  APP_URL: emptyToUndefined(z.string().min(1)),

  // SMTP is entirely optional: when unset, email.service.ts logs the message
  // instead of sending it (see that file) rather than failing at startup —
  // no SMTP credentials are available in every environment this runs in.
  // `.env.example` ships these present-but-empty (`SMTP_HOST=`), and dotenv
  // parses that as an empty string, not an absent key — the `optional()`
  // alone wouldn't accept `""`, so an unfilled-in `.env` copied verbatim
  // would otherwise fail validation at boot. The `emptyToUndefined` preprocess
  // below treats `""` the same as "not set" for every SMTP_* field.
  SMTP_HOST: emptyToUndefined(z.string().min(1)),
  SMTP_PORT: emptyToUndefined(z.coerce.number().int().positive()),
  SMTP_USER: emptyToUndefined(z.string().min(1)),
  SMTP_PASSWORD: emptyToUndefined(z.string().min(1)),
  SMTP_FROM: emptyToUndefined(z.string().min(1)),

  // Notifications push (VAPID). Générer une paire avec
  // `npx web-push generate-vapid-keys`, ou voir .env.example.
  //
  // La longueur décodée est vérifiée, pas seulement la présence : une clé
  // tronquée au copier-coller passerait un simple `min(1)` et n'échouerait
  // qu'au premier envoi, avec une erreur du service push illisible.
  VAPID_PUBLIC_KEY: z
    .string()
    .refine((v) => longueurBase64Url(v) === 65, {
      message: "VAPID_PUBLIC_KEY must decode to 65 bytes (uncompressed P-256 point)",
    }),
  VAPID_PRIVATE_KEY: z
    .string()
    .refine((v) => longueurBase64Url(v) === 32, {
      message: "VAPID_PRIVATE_KEY must decode to 32 bytes (P-256 private scalar)",
    }),
  // Contact transmis aux services push (FCM, Mozilla) pour qu'ils puissent
  // signaler un problème. `mailto:` ou URL https.
  VAPID_SUBJECT: z
    .string()
    .refine((v) => v.startsWith("mailto:") || v.startsWith("https://"), {
      message: "VAPID_SUBJECT must start with 'mailto:' or 'https://'",
    }),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
}).transform((valeurs) => ({
  ...valeurs,
  // Repli sur la première origine autorisée quand APP_URL n'est pas définie —
  // c'est exactement ce que valait CORS_ORIGIN avant qu'il ne devienne une
  // liste, donc les environnements déjà déployés gardent le comportement
  // qu'ils avaient sans avoir à ajouter la variable en urgence.
  APP_URL: valeurs.APP_URL ?? valeurs.CORS_ORIGIN[0],
}));

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // console.error is allowed by the `no-console` rule; the structured logger
    // depends on env being valid, so it can't be used here yet.
    console.error("\n❌ Invalid environment configuration. The server will not start.\n");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error("\nCheck your .env file against .env.example.\n");
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type { Env };
