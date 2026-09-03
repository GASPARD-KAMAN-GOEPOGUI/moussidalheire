import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { disconnectDatabase, logStartupDatabaseStatus } from "@/config/database";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`✓ Serveur démarré sur le port ${env.PORT} [${env.NODE_ENV}]`);
  void logStartupDatabaseStatus();
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
  });
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});
