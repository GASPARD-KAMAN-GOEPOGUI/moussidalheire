import { Router } from "express";
import { getHealth } from "@/controllers/health.controller";

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Check API and database health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: The API is running; `database` reflects MySQL connectivity.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: API is running
 *                 environment:
 *                   type: string
 *                   example: development
 *                 database:
 *                   type: string
 *                   enum: [connected, disconnected]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRouter.get("/", getHealth);
