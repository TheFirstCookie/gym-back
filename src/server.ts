import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

// Render sends SIGTERM and waits up to 30s; exit well before it resorts to SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 10_000;

// An explicit http.Server (rather than app.listen) so socket.io can share the port later.
const server = createServer(createApp());

server.on("error", (error) => {
  logger.error("HTTP server failed", { err: error });
  process.exit(1);
});

server.listen(env.PORT, () => {
  logger.info(`ForgeFit Supply API listening on port ${env.PORT}`, { nodeEnv: env.NODE_ENV });
});

function shutdown(signal: NodeJS.Signals) {
  logger.info(`${signal} received, closing HTTP server`);

  server.close((error) => {
    if (error) {
      logger.error("Error while closing HTTP server", { err: error });
      process.exit(1);
    }
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // In-flight keep-alive or streaming requests must not hold the process open forever.
  setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
