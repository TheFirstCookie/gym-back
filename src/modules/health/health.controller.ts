import type { Request, Response } from "express";
import { healthRepository } from "./health.repository.js";

export const healthController = {
  // Always 200 while the process is serving: a database outage is reported, not fatal,
  // so Render doesn't restart a healthy instance because Supabase is unreachable.
  async check(_req: Request, res: Response) {
    const dbUp = await healthRepository.pingDatabase();

    res.json({
      data: {
        status: dbUp ? "ok" : "degraded",
        db: dbUp ? "up" : "down",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  },
};
