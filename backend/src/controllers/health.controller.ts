import type { Request, Response } from "express";
import { env } from "@/config/env";
import { getHealthStatus } from "@/services/health.service";
import type { ApiSuccess } from "@/types/api-response";

type HealthResponse = ApiSuccess & {
  environment: string;
  database: string;
  timestamp: string;
};

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const { database } = await getHealthStatus();

  const body: HealthResponse = {
    success: true,
    message: "API is running",
    environment: env.NODE_ENV,
    database,
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(body);
}
