import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";

const app = createApp();

describe("GET /api/v1/health", () => {
  it("returns a 200 with the expected success envelope", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: "API is running",
      environment: "test",
    });
    expect(["connected", "disconnected"]).toContain(res.body.database);
    expect(typeof res.body.timestamp).toBe("string");
    expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
  });
});
