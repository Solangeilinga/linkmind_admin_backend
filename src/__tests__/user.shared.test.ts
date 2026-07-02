/**
 * Tests — user.shared.ts
 *
 * Vérifie les contrats de type et les champs exclus volontairement
 * du schéma admin (password, refreshToken, fcmToken…).
 *
 * Ces tests ne nécessitent pas de connexion MongoDB :
 * ils opèrent sur les types TypeScript et les définitions de schéma.
 */

import mongoose from "mongoose";
import { IUser, User } from "../models/user.shared";

// ─── Champs exclus du schéma admin ───────────────────────────────────────────

describe("user.shared — champs exclus (données sensibles)", () => {
  const schemaPaths = Object.keys((User.schema as any).paths);

  const EXCLUDED_FIELDS = ["password", "refreshToken", "otp", "otpExpires", "publicKey", "privateKey", "fcmToken"];

  EXCLUDED_FIELDS.forEach(field => {
    it(`le champ '${field}' est absent du schéma admin`, () => {
      expect(schemaPaths).not.toContain(field);
    });
  });
});

// ─── Champs présents et attendus ─────────────────────────────────────────────

describe("user.shared — champs requis présents", () => {
  const schemaPaths = Object.keys((User.schema as any).paths);

  const REQUIRED_FIELDS = [
    "email", "isAdmin", "isActive", "isBanned",
    "totalPoints", "level", "isPremium",
    "isEmailVerified", "legalAccepted",
    "suspicionScore", "restricted",
  ];

  REQUIRED_FIELDS.forEach(field => {
    it(`le champ '${field}' est présent`, () => {
      expect(schemaPaths.some(p => p === field || p.startsWith(field + "."))).toBe(true);
    });
  });
});

// ─── Collection cible ────────────────────────────────────────────────────────

describe("user.shared — configuration du modèle", () => {
  it("pointe vers la collection 'users' (partagée avec le backend principal)", () => {
    expect(User.collection.name).toBe("users");
  });

  it("le modèle s'appelle 'User'", () => {
    expect(User.modelName).toBe("User");
  });

  it("strict:false pour tolérer les champs du backend principal non mappés", () => {
    const options = (User.schema as any).options;
    expect(options.strict).toBe(false);
  });
});

// ─── Intégrité des types AdminRole ───────────────────────────────────────────

describe("user.shared — enum adminRole", () => {
  const adminRolePath = (User.schema as any).paths["adminRole"];

  it("le champ adminRole accepte les 4 rôles définis", () => {
    const enumValues: string[] = adminRolePath?.enumValues ?? [];
    expect(enumValues).toEqual(
      expect.arrayContaining(["super_admin", "admin", "moderator", "analyst"])
    );
  });

  it("le champ adminRole n'accepte pas de valeur hors liste", () => {
    // Validation Mongoose synchrone
    const userDoc = new User({ adminRole: "god_mode" } as Partial<IUser>);
    const error = userDoc.validateSync();
    expect(error?.errors["adminRole"]).toBeDefined();
  });
});