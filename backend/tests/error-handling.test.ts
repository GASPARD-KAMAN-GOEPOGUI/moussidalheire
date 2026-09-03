import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "@/utils/app-error";
import { errorMiddleware } from "@/middlewares/error.middleware";
import { notFoundMiddleware } from "@/middlewares/not-found.middleware";

function buildTestApp() {
  const app = express();

  app.get("/conflict", () => {
    throw AppError.conflict("Already exists.", { field: "matricule" });
  });

  app.get("/boom", () => {
    throw new Error("something exploded with a sensitive stack trace");
  });

  app.get("/async-boom", async () => {
    await Promise.resolve();
    throw AppError.forbidden();
  });

  // Mission "messages d'erreur humains" — chacune de ces routes simule un
  // type d'erreur technique brute qui ne doit JAMAIS atteindre l'utilisateur
  // telle quelle (voir tests ci-dessous).
  app.get("/zod-boom", () => {
    const result = z.object({ nom: z.string() }).safeParse({});
    if (!result.success) throw result.error;
  });

  app.get("/prisma-known-boom", () => {
    throw new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`matricule`)",
      { code: "P2002", clientVersion: "test", meta: { target: ["matricule"] } },
    );
  });

  app.get("/prisma-validation-boom", () => {
    throw new Prisma.PrismaClientValidationError(
      "Invalid `prisma.personne.create()` invocation: Argument `sexe` is missing.",
      { clientVersion: "test" },
    );
  });

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}

/** Aucun de ces fragments techniques ne doit jamais apparaître dans une
 * réponse d'erreur envoyée au client — nom de librairie, code Prisma, nom de
 * colonne/table, jargon HTTP brut. */
const FRAGMENTS_TECHNIQUES_INTERDITS = [
  "Prisma",
  "P2002",
  "ZodError",
  "matricule",
  "constraint",
  "Validation failed",
  "database layer",
  "stack trace",
];

function verifierAucunFragmentTechnique(body: unknown): void {
  const texte = JSON.stringify(body);
  for (const fragment of FRAGMENTS_TECHNIQUES_INTERDITS) {
    expect(texte).not.toContain(fragment);
  }
}

describe("Centralized error handling", () => {
  const app = buildTestApp();

  it("formats a known AppError with its status code, code and details", async () => {
    const res = await request(app).get("/conflict");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      message: "Already exists.",
      error: { code: "CONFLICT", details: { field: "matricule" } },
    });
  });

  it("maps an unexpected thrown Error to a generic 500 without leaking its message", async () => {
    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(res.body)).not.toContain("sensitive stack trace");
  });

  it("catches errors thrown from an async handler (Express 5 native async support)", async () => {
    const res = await request(app).get("/async-boom");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("turns a raw ZodError into a human, French message with no technical jargon", async () => {
    const res = await request(app).get("/zod-boom");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe(
      "Certaines informations saisies ne sont pas valides. Merci de vérifier le formulaire.",
    );
    expect(res.body.message).not.toContain("Validation failed");
  });

  it("turns a Prisma known-request error (e.g. a unique constraint) into a human message, never the raw DB error", async () => {
    const res = await request(app).get("/prisma-known-boom");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DATABASE_ERROR");
    expect(res.body.message).toBe(
      "Cette opération n'a pas pu être effectuée car elle entre en conflit avec des données existantes.",
    );
    verifierAucunFragmentTechnique(res.body);
  });

  it("turns a Prisma validation error into a human message, never 'Invalid data sent to the database layer.'", async () => {
    const res = await request(app).get("/prisma-validation-boom");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("DATABASE_VALIDATION_ERROR");
    expect(res.body.message).toBe("Certaines informations envoyées sont invalides. Merci de réessayer.");
    verifierAucunFragmentTechnique(res.body);
  });

  it("maps an unexpected error to a human French message (never English, never technical)", async () => {
    const res = await request(app).get("/boom");

    expect(res.body.message).toBe(
      "Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.",
    );
  });
});
