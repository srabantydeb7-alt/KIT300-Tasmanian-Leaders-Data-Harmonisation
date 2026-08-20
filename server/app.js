const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const cors = require("cors");
const express = require("express");

const { createDatasetRouter } = require("./Routes/datasets");
const { createRunsRouter } = require("./Routes/runs");
const { createRulesRouter } = require("./Routes/rules");
const { RunService } = require("./Services/runService");
const { JsonStore } = require("./Store/jsonStore");

function getOrCreateHmacSecret(dataDir, suppliedSecret) {
  if (suppliedSecret) {
    const secret = String(suppliedSecret);
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("HARMONISATION_HMAC_SECRET must contain at least 32 bytes.");
    }
    return secret;
  }
  const secretPath = path.join(path.resolve(dataDir), ".hmac-secret");
  if (fs.existsSync(secretPath)) {
    const stat = fs.lstatSync(secretPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("The HMAC secret path is not a regular file.");
    }
    const secret = fs.readFileSync(secretPath, "utf8").trim();
    if (secret.length < 32) throw new Error("The persisted HMAC secret is invalid.");
    return secret;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, `${secret}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return secret;
}

function corsOptions() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    origin(origin, callback) {
      if (
        !origin ||
        configured.includes(origin) ||
        (!configured.length && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin))
      ) {
        return callback(null, true);
      }
      const error = new Error("Origin is not allowed by CORS.");
      error.status = 403;
      return callback(error);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  };
}

function createApp(options = {}) {
  const hasCustomDataDir = Boolean(options.dataDir);
  const dataDir = path.resolve(
    options.dataDir ||
      process.env.HARMONISATION_DATA_DIR ||
      path.join(__dirname, "data"),
  );
  const uploadDir = path.resolve(
    options.uploadDir ||
      (hasCustomDataDir ? path.join(dataDir, "uploads") : path.join(__dirname, "uploads")),
  );
  const clientBuildDir = path.resolve(
    options.clientBuildDir || path.join(__dirname, "..", "client", "build"),
  );
  const store = options.store || new JsonStore(dataDir);
  const hmacSecret = getOrCreateHmacSecret(
    dataDir,
    options.hmacSecret || process.env.HARMONISATION_HMAC_SECRET,
  );
  const runService = new RunService({ store, hmacSecret });
  const app = express();

  app.disable("x-powered-by");
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: "256kb", strict: true }));

  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        message: "KIT300 Data Harmonisation API is running",
      },
    });
  });
  app.get("/api/overview", (req, res, next) => {
    try {
      res.json({ success: true, data: runService.overview() });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/questions", (req, res, next) => {
    try {
      res.json({ success: true, data: runService.targetQuestions() });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/datasets", createDatasetRouter({ runService, uploadDir }));
  app.use("/api/runs", createRunsRouter(runService));
  app.use("/api/rules", createRulesRouter(runService));

  const clientIndex = path.join(clientBuildDir, "index.html");
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientBuildDir, { dotfiles: "deny", index: false }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(clientIndex));
  }

  app.use((req, res) => {
    res.status(404).json({ success: false, error: { message: "API route not found." } });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
    if (status >= 500) console.error("API error:", error);
    const message = status >= 500 ? "The server could not complete the request." : error.message;
    return res.status(status).json({ success: false, error: { message } });
  });

  return app;
}

module.exports = { createApp, getOrCreateHmacSecret };
