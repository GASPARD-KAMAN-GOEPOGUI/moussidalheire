import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import mariadb from "mariadb";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

/**
 * Runs once before `dev`/`start` (wired as npm's `predev`/`prestart` hooks — npm
 * runs `pre<script>` automatically before `<script>`) so a freshly dropped or
 * newly created MySQL server never needs a manual `CREATE DATABASE` +
 * `prisma migrate` step. Both actions below are idempotent, so running this on
 * every startup — not just the first one — is safe and cheap.
 */

// Interpolated directly into a raw CREATE DATABASE statement below; identifiers
// can't be parameterized like values, so this guards against a malformed
// DB_NAME reaching raw SQL instead.
const DB_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

async function ensureDatabaseExists(): Promise<void> {
  if (!DB_NAME_PATTERN.test(env.DB_NAME)) {
    throw new Error(
      `DB_NAME "${env.DB_NAME}" contains characters unsafe for a raw CREATE DATABASE statement.`,
    );
  }

  // No `database` option here on purpose: the target database may not exist
  // yet, and MariaDB refuses to open a connection scoped to a missing one.
  const connection = await mariadb.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectTimeout: 5000,
    allowPublicKeyRetrieval: true,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4`);
    logger.info(`✓ Base de données \`${env.DB_NAME}\` prête`);
  } finally {
    await connection.end();
  }
}

function hasExistingMigrations(): boolean {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  if (!existsSync(migrationsDir)) return false;
  return readdirSync(migrationsDir).some((entry) =>
    statSync(join(migrationsDir, entry)).isDirectory(),
  );
}

function runMigrations(): void {
  // First run ever (no migration folder yet): generate the baseline from the
  // current schema.prisma and apply it. Every run after that: only apply
  // whatever's pending — never regenerate, so it stays non-interactive.
  const command = hasExistingMigrations()
    ? "npx prisma migrate deploy"
    : "npx prisma migrate dev --name init";

  logger.info(`→ ${command}`);
  execSync(command, { stdio: "inherit" });
}

async function main(): Promise<void> {
  await ensureDatabaseExists();
  runMigrations();
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Échec du bootstrap de la base de données");
  process.exit(1);
});
