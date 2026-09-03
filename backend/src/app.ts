import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { v1Router } from "@/routes";
import { swaggerSpec } from "@/config/swagger";
import { notFoundMiddleware } from "@/middlewares/not-found.middleware";
import { errorMiddleware } from "@/middlewares/error.middleware";
import { PHOTOS_DIR } from "@/middlewares/upload.middleware";

/**
 * Builds the Express app without starting it listening — kept separate from
 * server.ts so tests can `import { app }` and drive it with supertest against
 * an in-memory server, with no real port bound.
 */
export function createApp(): Application {
  const app = express();

  // Behind a reverse proxy in production (Render/Fly/nginx/...), needed for
  // express-rate-limit and req.ip to see the real client IP via X-Forwarded-For.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      // Keep access logs quiet in test runs; still available via `logger` directly.
      autoLogging: env.NODE_ENV !== "test",
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Generous on purpose: a single browsing session can easily fire dozens of
  // GETs (dashboard alone), and this limiter is per-IP — several villagers
  // behind the same router share one budget. Brute-force protection on
  // /auth/connexion lives separately (see auth.routes.ts::connexionLimiter).
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", apiLimiter);

  app.use("/api/v1", v1Router);

  // Serves whatever `/api/v1/uploads/photo` writes to disk — no auth (a
  // profile photo isn't sensitive, and it must render for anyone viewing a
  // fiche, same as it would from any other static asset host).
  //
  // The global helmet() above sets `Cross-Origin-Resource-Policy: same-origin`
  // on every response, including these — harmless for JSON, but it makes
  // browsers refuse to actually render an `<img src="http://localhost:5000/
  // storage/photos/...">` from the frontend's own origin (5173 in dev, a
  // different domain in prod), regardless of CORS being configured correctly
  // (CORP and CORS are separate mechanisms). Scoped override, same pattern as
  // the `/api-docs` CSP relaxation below — only this path gets a permissive
  // CORP, not the whole API.
  app.use(
    "/storage/photos",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(PHOTOS_DIR),
  );

  // Scoped CSP override: the global helmet() above blocks the inline
  // script/style Swagger UI's HTML page needs to render — relax it only for
  // this path rather than weakening CSP for the whole API.
  app.use(
    "/api-docs",
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec),
  );

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
