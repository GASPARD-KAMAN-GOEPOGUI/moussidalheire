import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";

const app = createApp();

describe("Unknown routes", () => {
  it("responds with a 404 in the standard error envelope", async () => {
    const res = await request(app).get("/api/v1/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      message: "La ressource demandée est introuvable.",
      error: { code: "NOT_FOUND" },
    });
  });

  it("never leaks the raw method/path in the user-facing message", async () => {
    const res = await request(app).get("/api/v1/this-route-does-not-exist");

    expect(res.body.message).not.toContain("this-route-does-not-exist");
    expect(res.body.message).not.toContain("GET");
    expect(res.body.message).not.toContain("Route not found");
  });
});
