import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "@/middlewares/validate.middleware";
import { paginationQuerySchema } from "@/schemas/common/pagination.schema";
import { errorMiddleware } from "@/middlewares/error.middleware";

/**
 * A minimal throwaway app exercising `validate()` directly, independent of any
 * real route — this stage has no business endpoints to validate against yet.
 */
function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/query", validate(paginationQuerySchema, "query"), (req, res) => {
    res.status(200).json({ success: true, message: "ok", parsed: req.query });
  });

  const bodySchema = z.object({ name: z.string().min(1) });
  app.post("/body", validate(bodySchema, "body"), (req, res) => {
    res.status(200).json({ success: true, message: "ok", parsed: req.body });
  });

  app.use(errorMiddleware);
  return app;
}

describe("validate() middleware", () => {
  const app = buildTestApp();

  it("passes through and applies defaults for a valid query", async () => {
    const res = await request(app).get("/query");

    expect(res.status).toBe(200);
    expect(res.body.parsed).toEqual({ page: 1, pageSize: 20 });
  });

  it("rejects an invalid query with a 400 VALIDATION_ERROR envelope and a human, French message", async () => {
    const res = await request(app).get("/query?page=-1");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      message: "Certaines informations saisies ne sont pas valides. Merci de vérifier le formulaire.",
      error: { code: "VALIDATION_ERROR" },
    });
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("rejects an invalid body with a 400 VALIDATION_ERROR envelope", async () => {
    const res = await request(app).post("/body").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid body", async () => {
    const res = await request(app).post("/body").send({ name: "Village" });

    expect(res.status).toBe(200);
    expect(res.body.parsed).toEqual({ name: "Village" });
  });
});
