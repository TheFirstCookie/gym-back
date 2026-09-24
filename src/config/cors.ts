import type { CorsOptions } from "cors";
import { env } from "./env.js";

const allowedOrigins = new Set([
  ...env.CORS_ORIGINS,
  ...(env.isProduction ? [] : ["http://localhost:3000"]),
]);

export const corsOptions: CorsOptions = {
  // Requests without an Origin (curl, Render health checks, server-to-server) aren't
  // subject to CORS. Unknown origins get no CORS headers rather than an error response.
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  maxAge: 600,
};
