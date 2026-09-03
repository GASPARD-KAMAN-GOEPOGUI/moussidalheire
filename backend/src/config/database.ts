import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

/**
 * The single Prisma client for the whole app — Application -> Prisma -> MySQL.
 * No repository or service may instantiate its own `PrismaClient`; they import
 * `prisma` from here. In development, `tsx watch` re-executes this module on
 * every file change, so the client is cached on `globalThis` to avoid exhausting
 * MySQL's connection pool with a fresh client per reload.
 *
 * Prisma 7 removed the schema-level `datasource.url` for the *runtime* client —
 * `PrismaClient` now requires an explicit driver adapter (see prisma.config.ts,
 * which configures the *CLI*'s connection separately, for generate/migrate).
 */
declare global {
  var __prisma: PrismaClient | undefined;
}

// mariadb's pool defaults to a 10s `acquireTimeout`, which would make the health
// check hang instead of quickly reporting "disconnected" when MySQL is unreachable.
//
// `allowPublicKeyRetrieval` is required for MySQL 8's default `caching_sha2_password`
// auth plugin to work over a non-SSL connection — without it the driver fails with
// "RSA public key is not available client side" even with correct credentials.
// Safe for local/trusted-network MySQL; revisit if this ever connects over an
// untrusted network without TLS.
const adapter = new PrismaMariaDb({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  connectTimeout: 2000,
  acquireTimeout: 2000,
  allowPublicKeyRetrieval: true,
});

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV === "development") {
  global.__prisma = prisma;
}

export type DatabaseStatus = "connected" | "disconnected";

/**
 * Used by the health endpoint. Never throws — a database outage must degrade the
 * health check's `database` field, not crash the request or the process.
 */
export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "connected";
  } catch (error) {
    logger.warn({ err: error }, "Database health check failed");
    return "disconnected";
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * One-shot, human-readable connectivity check logged once at server startup —
 * distinct from `checkDatabaseConnection`, which the health endpoint polls on
 * every request. Never includes the password: only host/port/database (all
 * non-secret) and the driver's error message, which mariadb does not embed
 * credentials into.
 */
export async function logStartupDatabaseStatus(): Promise<void> {
  const status = await checkDatabaseConnection();

  if (status === "connected") {
    logger.info(`✓ Connexion MySQL établie (${env.DB_HOST}:${env.DB_PORT})`);
    logger.info(`✓ Base de données : ${env.DB_NAME}`);
  } else {
    logger.error(
      `✗ Connexion MySQL impossible sur ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME} — ` +
        "vérifiez que le serveur MySQL est démarré et que DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD sont corrects.",
    );
  }
}
