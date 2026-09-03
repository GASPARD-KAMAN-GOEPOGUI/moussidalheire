import swaggerJsdoc from "swagger-jsdoc";
import { env } from "@/config/env";

/**
 * The OpenAPI spec is generated from `@openapi` JSDoc blocks living next to each
 * route file (see src/routes/health.routes.ts for the pattern) — no schema is
 * hand-maintained separately, so the docs can't drift from the routes as new
 * business modules are added.
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Moussidalheire API",
      version: "0.1.0",
      description: "API backend for the Moussidalheire village management platform.",
    },
    servers: [
      {
        url: `/api/v1`,
        description: `${env.NODE_ENV} server`,
      },
    ],
  },
  // Dev/test run the TS sources directly (tsx/vitest); the production build
  // runs compiled JS from dist/ instead — comments survive the build since
  // tsconfig.build.json keeps `removeComments: false`.
  apis: [env.NODE_ENV === "production" ? "./dist/routes/**/*.js" : "./src/routes/**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
