type LogLevel = "info" | "warn" | "error" | "debug";

const shouldLogDebug = process.env.NODE_ENV !== "production";

const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
  const timestamp = new Date().toISOString();
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  // eslint-disable-next-line no-console
  console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}${payload}`);
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (shouldLogDebug) {
      log("debug", message, meta);
    }
  },
};
