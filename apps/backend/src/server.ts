import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const app = buildApp();

const server = app.listen(env.port, env.host, () => {
  logger.info(`Backend listening on port ${env.port}`, { env: env.nodeEnv, host: env.host });
});

server.keepAliveTimeout = env.keepAliveTimeoutMs;
server.headersTimeout = env.keepAliveTimeoutMs + 1000;

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}; starting graceful shutdown`);
  server.close((error) => {
    if (error) {
      logger.error("Graceful shutdown failed", { error: error.message });
      process.exit(1);
      return;
    }
    logger.info("Server closed cleanly");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, env.gracefulShutdownMs).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.message });
  shutdown("SIGTERM");
});
