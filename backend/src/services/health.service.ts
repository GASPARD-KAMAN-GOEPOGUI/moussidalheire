import { checkDatabaseConnection, type DatabaseStatus } from "@/config/database";

export interface HealthStatus {
  database: DatabaseStatus;
}

/**
 * Thin on purpose — this is the pattern future business services follow
 * (routes -> controllers -> services -> repositories -> Prisma), not a real
 * business rule. Health has no repository layer: it queries the database
 * connection directly rather than a domain table.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const database = await checkDatabaseConnection();
  return { database };
}
