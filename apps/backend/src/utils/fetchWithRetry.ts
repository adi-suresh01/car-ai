import { env } from "../config/env";
import { logger } from "./logger";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (delayMs: number) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, delayMs);
  timer.unref();
});

export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  options?: { retries?: number; retryDelayMs?: number; timeoutMs?: number },
): Promise<Response> => {
  const retries = options?.retries ?? 1;
  const retryDelayMs = options?.retryDelayMs ?? 120;
  const timeoutMs = options?.timeoutMs ?? env.upstreamTimeoutMs;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === retries) {
        return response;
      }
      logger.warn("Retrying upstream request after retryable status", {
        status: response.status,
        attempt: attempt + 1,
        retries,
      });
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      logger.warn("Retrying upstream request after network failure", {
        attempt: attempt + 1,
        retries,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      clearTimeout(timeout);
    }

    await sleep(retryDelayMs * (attempt + 1));
  }

  throw new Error("Unreachable retry state");
};
