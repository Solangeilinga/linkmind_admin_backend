/**
 * Types partagés du modèle User entre le backend principal (JS) et le backend admin (TS).
 *
 * RÈGLE : toute modification du schéma User dans LinkMind_Backend/src/models/user.model.js
 * doit être répercutée ici. Ce fichier est la source de vérité côté admin.
 *
 * Les champs sensibles (password, refreshToken, otp*, publicKey, privateKey)
 * sont exclus : ils ne sont jamais renvoyés au backend admin.
 */

import mongoose, { Schema, Document } from "mongoose";

// ─── Types de base ────────────────────────────────────────────────────────────

export type AdminRole  = "super_admin" | "admin" | "moderator" | "analyst";
export type UserLevel  = "bronze" | "silver" | "gold" | "platinum";
export type UserGender = "homme" | "femme" | "autre" | "non_specifie";
export type AccountStatus = "active" | "locked" | "suspended";
export type FlagType = "suspicious_activity" | "spam" | "harassment";

// ─── Interface IUser ──────────────────────────────────────────────────────────

export interface IUser extends Document {
  // Identité
  name?:           string;
  firstName?:      string;
  lastName?:       string;
  email?:          string;
  avatar?:         string;
  anonymousAlias?: string;
  phone?:          string;
  age?:            number;
  city?:           string;
  gender?:         UserGender | null;

  // Champs sensibles (select: false — jamais retournés par défaut)
  password?:      string;
  refreshToken?:  string;

  // Rôles & statut
  isAdmin:        boolean;
  adminRole?:     AdminRole;
  isActive:       boolean;
  isBanned?:      boolean;
  banReason?:     string;
  accountStatus?: AccountStatus;

  // Gamification
  totalPoints?:       number;
  level?:             UserLevel;
  streakDays?:        number;
  lastActivityDate?:  Date | null;
  badges?:            Array<{ badgeId: string; earnedAt?: Date }>;

  // Daily challenge
  dailyChallengeAssignment?: {
    date?:         string | null;
    challengeIds?: mongoose.Types.ObjectId[];
    moodLabel?:    string | null;
  };

  // Premium / Mindo
  isPremium?:           boolean;
  premiumExpiresAt?:    Date | null;
  mindoMessageCount?:   number;
  mindoLastMessageDate?: Date | null;

  // Push
  fcmToken?: string;

  // Préférences
  preferences?: {
    notificationsEnabled?:  boolean;
    reminderTime?:          string;
    anonymousInCommunity?:  boolean;
    theme?:                 "light" | "dark" | "auto";
    goals?:                 string[];
  };

  // Auth
  isEmailVerified?: boolean;
  legalAccepted?:   boolean;
  legalAcceptedAt?: Date | null;
  legalVersion?:    string | null;

  // Sécurité
  lastActivity?:          Date;
  sessionId?:             string | null;
  maxConcurrentSessions?: number;
  loginAttempts?:         number;
  lastLoginAttempt?:      Date | null;
  isLocked?:              boolean;
  lockedUntil?:           Date | null;
  restricted?:            boolean;
  restrictionReason?:     string;
  restrictedUntil?:       Date | null;
  suspicionScore?:        number;
  flags?: Array<{
    type:        FlagType;
    score:       number;
    timestamp:   Date;
    resolved:    boolean;
    resolvedBy?: mongoose.Types.ObjectId;
  }>;

  // activityLog supprimé du User (migration vers collection UserActivity)
  // Voir : src/models/user-activity.model.ts

  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Schéma Mongoose (vue admin — sans les champs secrets) ───────────────────
//
// Ce schéma se connecte à la collection "users" déjà créée par le backend
// principal. Il est intentionnellement moins strict (pas de validators JS) :
// la validation à l'écriture appartient au backend principal.
// L'admin lit et fait des mises à jour ciblées ($set atomiques).

const UserSchema = new Schema<IUser>(
  {
    name:           { type: String },
    firstName:      { type: String },
    lastName:       { type: String },
    email:          { type: String },
    // password : select:false — jamais retourné par défaut.
    // Les routes admin qui en ont besoin utilisent .select('+password')
    password:       { type: String, select: false },
    avatar:         { type: String },
    anonymousAlias: { type: String },
    phone:          { type: String },
    age:            { type: Number },
    city:           { type: String },
    gender:         { type: String },

    isAdmin:       { type: Boolean, default: false },
    adminRole:     { type: String, enum: ["super_admin", "admin", "moderator", "analyst"] },
    isActive:      { type: Boolean, default: true },
    isBanned:      { type: Boolean, default: false },
    banReason:     { type: String },
    accountStatus: { type: String, enum: ["active", "locked", "suspended"], default: "active" },

    totalPoints:      { type: Number, default: 0 },
    level:            { type: String, enum: ["bronze", "silver", "gold", "platinum"], default: "bronze" },
    streakDays:       { type: Number, default: 0 },
    lastActivityDate: { type: Date },
    badges: [{
      badgeId:  { type: String },
      earnedAt: { type: Date },
    }],

    dailyChallengeAssignment: {
      date:         { type: String },
      challengeIds: [{ type: Schema.Types.ObjectId }],
      moodLabel:    { type: String },
    },

    isPremium:            { type: Boolean, default: false },
    premiumExpiresAt:     { type: Date },
    mindoMessageCount:    { type: Number, default: 0 },
    mindoLastMessageDate: { type: Date },

    // fcmToken exclu (inutile côté admin + données sensibles)
    preferences: {
      notificationsEnabled: { type: Boolean },
      reminderTime:         { type: String },
      anonymousInCommunity: { type: Boolean },
      theme:                { type: String },
      goals:                [{ type: String }],
    },

    // refreshToken, otp*, publicKey, privateKey exclus volontairement
    isEmailVerified: { type: Boolean, default: false },
    legalAccepted:   { type: Boolean, default: false },
    legalAcceptedAt: { type: Date },
    legalVersion:    { type: String },

    lastActivity:          { type: Date },
    sessionId:             { type: String },
    maxConcurrentSessions: { type: Number, default: 3 },
    loginAttempts:         { type: Number, default: 0 },
    lastLoginAttempt:      { type: Date },
    isLocked:              { type: Boolean, default: false },
    lockedUntil:           { type: Date },
    restricted:            { type: Boolean, default: false },
    restrictionReason:     { type: String },
    restrictedUntil:       { type: Date },
    suspicionScore:        { type: Number, default: 0 },
    flags: [{
      type:       { type: String, enum: ["suspicious_activity", "spam", "harassment"] },
      score:      { type: Number },
      timestamp:  { type: Date },
      resolved:   { type: Boolean, default: false },
      resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    }],

    // activityLog retiré — voir UserActivity collection séparée
  },
  {
    collection:  "users",
    timestamps:  true,
    // Tolérant aux champs inconnus : le backend principal peut ajouter des champs
    // sans casser le backend admin (strict: false en lecture seule).
    strict: false,
  }
);

export const User: mongoose.Model<IUser> =
  mongoose.models.User
    ? (mongoose.model("User") as mongoose.Model<IUser>)
    : mongoose.model<IUser>("User", UserSchema);