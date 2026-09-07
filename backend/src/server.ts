import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { disconnectDatabase, logStartupDatabaseStatus } from "@/config/database";

const app = createApp();

// En production le serveur vit derrière nginx : n'écouter que sur la boucle
// locale, sinon le port reste joignable directement depuis l'extérieur. Un
// client qui contourne le proxy fournit son propre X-Forwarded-For, auquel
// `trust proxy` (voir app.ts) fait alors confiance — le rate limiting par IP
// devient contournable. En dev on garde 0.0.0.0 pour pouvoir tester depuis un
// téléphone du même réseau.
const HOST = env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";

const server = app.listen(env.PORT, HOST, () => {
  logger.info(
    `✓ Serveur démarré sur ${HOST}:${env.PORT} [${env.NODE_ENV}]`,
  );
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
