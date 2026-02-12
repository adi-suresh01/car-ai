import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const app = buildApp();

const server = app.listen(env.port, env.host, () => {
  logger.info(`Backend listening on port ${env.port}`, { env: env.nodeEnv, host: env.host });
});

server.keepAliveTimeout = env.keepAliveTimeoutMs;
server.headersTimeout = env.keepAliveTimeoutMs + 1000;
