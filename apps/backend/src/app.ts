import cors from "cors";
import express from "express";
import { apiRouter } from "./routes";
import { env } from "./config/env";

export const buildApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.trustProxy);

  app.use(cors());
  app.use("/api/voice/webhooks/elevenlabs", express.raw({ type: "*/*" }));
  app.use("/api/voice/transcriptions/file", express.raw({ type: "*/*", limit: "12mb" }));

  const jsonParser = express.json();
  app.use((req, res, next) => {
    if (
      req.originalUrl === "/api/voice/webhooks/elevenlabs" ||
      req.originalUrl === "/api/voice/transcriptions/file"
    ) {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", apiRouter);

  return app;
};
