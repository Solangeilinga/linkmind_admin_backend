import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import authRoutes          from "./routes/auth.routes";
import usersRoutes         from "./routes/users.routes";
import reportsRoutes       from "./routes/reports.routes";
import contentRoutes       from "./routes/content.routes";
import bookingsRoutes      from "./routes/bookings.routes";
import challengesRoutes    from "./routes/challenges.routes";
import professionalsRoutes from "./routes/professionals.routes";
import adsRoutes           from "./routes/ads.routes";
import configRoutes        from "./routes/config.routes";
import { errorHandler } from "./middleware/error.middleware";
import logger from "./utils/logger";

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security ─────────────────────────────────────────────────
app.use(helmet());
app.set("trust proxy", 1);

// ── CORS ─────────────────────────────────────────────────────
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

app.use(
  cors({
    origin: (origin, cb) => {
      // Permettre les requêtes sans origine (Postman, curl, etc.)
      if (!origin) return cb(null, true);
      
      // Autoriser uniquement l'URL du frontend configurée
      if (origin === FRONTEND_URL || origin === FRONTEND_URL.replace(/\/$/, "")) {
        return cb(null, true);
      }
      
      console.log(`❌ CORS blocked: ${origin} (expected: ${FRONTEND_URL})`);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Body ─────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// ── Health ───────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "OK", service: "LinkMind Admin API", env: process.env.NODE_ENV });
});

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth",          authRoutes);
app.use("/api/users",         usersRoutes);
app.use("/api/reports",       reportsRoutes);
app.use("/api/content",       contentRoutes);
app.use("/api/bookings",      bookingsRoutes);
app.use("/api/challenges",    challengesRoutes);
app.use("/api/professionals", professionalsRoutes);
app.use("/api/ads",           adsRoutes);
app.use("/api/config",        configRoutes);

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Error ────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/LinkMind");
    logger.info("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(50));
      console.log("🛡️  LinkMind Admin API");
      console.log("=".repeat(50));
      console.log(`📍 URL    : http://localhost:${PORT}`);
      console.log(`❤️  Health : http://localhost:${PORT}/health`);
      console.log(`🌍 Env    : ${process.env.NODE_ENV}`);
      console.log("=".repeat(50) + "\n");
    });
  } catch (err) {
    logger.error("❌ Failed to start: " + err);
    process.exit(1);
  }
};

startServer();
export default app;
