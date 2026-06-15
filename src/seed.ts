/**
 * Script de seed — crée le premier compte super_admin
 * Usage: npx ts-node src/seed.ts
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { User, AppConfig } from "./models";

async function seed() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/LinkMind";
  await mongoose.connect(uri);
  console.log("✅ MongoDB connecté");

  // ── Super Admin ─────────────────────────────────────────
  const email    = process.env.SEED_ADMIN_EMAIL    || "admin@linkmind.app";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin1234!";
  const name     = process.env.SEED_ADMIN_NAME     || "Super Admin";

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`⚠️  Utilisateur ${email} existe déjà — seed ignoré`);
  } else {
    const hashed = await bcrypt.hash(password, 12);
    await User.create({
      name,
      email,
      password: hashed,
      isAdmin:   true,
      adminRole: "super_admin",
      isActive:  true,
      isBanned:  false,
    });
    console.log(`✅ Super admin créé : ${email} / ${password}`);
    console.log("⚠️  Changez ce mot de passe immédiatement en production !");
  }

  // ── AppConfig par défaut ─────────────────────────────────
  const defaultConfigs = [
    { key: "commissionRate",        value: 0.05, description: "Taux de commission LinkMind (0.05 = 5%)", isPublic: false },
    { key: "currency",              value: "FCFA", description: "Devise par défaut",                      isPublic: true  },
    { key: "maxBookingsPerDay",     value: 50,   description: "Nombre max de réservations par jour",      isPublic: false },
    { key: "maintenanceMode",       value: false, description: "Mode maintenance (désactive l'app)",       isPublic: true  },
  ];
  for (const cfg of defaultConfigs) {
    const exists = await AppConfig.findOne({ key: cfg.key });
    if (!exists) {
      await AppConfig.create(cfg);
      console.log(`✅ Config créée : ${cfg.key} = ${cfg.value}`);
    }
  }

  await mongoose.disconnect();
  console.log("\n🎉 Seed terminé !");
}

seed().catch(err => {
  console.error("❌ Erreur seed :", err);
  process.exit(1);
});
