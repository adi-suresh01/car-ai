import cors from "cors";
import express from "express";
import { apiRouter } from "./routes";

export const buildApp = () => {
  const app = express();

  app.use(cors());
  app.use("/api/voice/webhooks/elevenlabs", express.raw({ type: "*/*" }));

  const jsonParser = express.json();
  app.use((req, res, next) => {
    if (req.originalUrl === "/api/voice/webhooks/elevenlabs") {
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
