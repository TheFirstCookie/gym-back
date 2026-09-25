import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOptions } from "./config/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";
import { stripeWebhookHandler } from "./modules/checkout/checkout.controller.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  // Render terminates TLS at its proxy; trust one hop so req.ip and req.protocol are the client's.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(requestLogger);

  // Raw-body routes go HERE, before express.json() consumes the request stream.
  // Stripe signs the exact bytes it sends, so the webhook must see them unparsed.
  app.post("/api/v1/checkout/webhook", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhookHandler);

  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
