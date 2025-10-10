import { buildApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const app = buildApp();

app.listen(env.port, () => {
  logger.info(`Backend listening on port ${env.port}`, { env: env.nodeEnv });
});
