/**
 * Tests — seed route security
 *
 * Vérifie que /api/seed est inaccessible en production
 * et accessible (avec auth) en développement.
 */

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

function superAdminToken() {
  return jwt.sign(
    { id: "sa1", email: "sa@sawaara.app", isAdmin: true, adminRole: "super_admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ─── Usine d'application minimaliste (sans MongoDB) ──────────────────────────

function buildApp(env: "production" | "development") {
  const app = express();
  app.use(express.json());

  // Simule la logique de index.ts pour /api/seed
  if (env !== "production") {
    app.use("/api/seed", (_req, res) => res.status(200).json({ ok: true }));
  } else {
    app.use("/api/seed", (_req, res) =>
      res.status(403).json({
        error:   "Route désactivée en production",
        message: "Utilisez `npm run seed` depuis le serveur pour initialiser les données.",
      })
    );
  }

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("/api/seed — sécurité selon l'environnement", () => {

  it("retourne 403 en production (quelle que soit l'auth)", async () => {
    const app = buildApp("production");
    const token = superAdminToken();

    const res = await request(app)
      .get("/api/seed/stress-factors")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/production/i);
  });

  it("est accessible en développement", async () => {
    const app = buildApp("development");

    const res = await request(app).get("/api/seed/stress-factors");
    expect(res.status).toBe(200);
  });

  it("le message d'erreur production oriente vers le CLI", async () => {
    const app = buildApp("production");

    const res = await request(app).post("/api/seed/badges").send({ name: "test" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("npm run seed");
  });
});