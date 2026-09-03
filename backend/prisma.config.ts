import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved datasource/migration configuration out of schema.prisma into
 * this file. The CLI (`prisma generate` / `prisma migrate`) needs a single
 * connection string; it's built here from the same discrete DB_HOST/DB_PORT/
 * DB_NAME/DB_USER/DB_PASSWORD variables the runtime `PrismaClient` in
 * src/config/database.ts reads independently via our own Zod-validated `env` —
 * one set of credentials, no separate DATABASE_URL to keep in sync.
 *
 * DB_PASSWORD is read directly from `process.env`, not via the `env()` helper
 * above: that helper throws on any falsy value, including an intentionally
 * empty string — but a passwordless local MySQL user (`DB_PASSWORD=""`, the
 * documented default in .env.example/README) is a legitimate, supported
 * configuration, not a missing one. `env()` stays in use for the other
 * variables, which must never legitimately be empty.
 */
const connectionUrl = `mysql://${encodeURIComponent(env("DB_USER"))}:${encodeURIComponent(
  process.env.DB_PASSWORD ?? "",
)}@${env("DB_HOST")}:${env("DB_PORT")}/${env("DB_NAME")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: connectionUrl,
  },
});
