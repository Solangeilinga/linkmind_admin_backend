import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";


// ── Rôles disponibles ─────────────────────────────────────────
// super_admin : accès total (contenu, config, annonces, défis, pros)
// admin       : utilisateurs + réservations + modération
// moderator   : modération signalements uniquement
// analyst     : lecture seule (rapports & stats)

export type AdminRole = "super_admin" | "admin" | "moderator" | "analyst";

export interface AdminRequest extends Request {
  admin?: { id: string; email: string; role: AdminRole };
  // Re-déclare explicitement les propriétés Express pour éviter les erreurs TypeScript
  body:   any;
  params: Record<string, string>;
  query:  Record<string, string | string[] | undefined>;
}

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 4,
  admin:       3,
  moderator:   2,
  analyst:     1,
};

export const protect = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const token = header.split(" ")[1];
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error("JWT_SECRET is not set — refusing all requests");
    return res.status(500).json({ error: "Configuration serveur manquante" });
  }
  try {
    const decoded = jwt.verify(token, secret) as any;
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: "Accès admin requis" });
    }
    req.admin = {
      id:    decoded.id,
      email: decoded.email,
      role:  (decoded.adminRole as AdminRole) || "analyst",
    };
    next();
  } catch (err: any) {
    logger.warn("Auth failed: " + err.message);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expiré", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Token invalide" });
  }
};

export const requireRole = (minRole: AdminRole) => {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const userLevel = ROLE_HIERARCHY[req.admin?.role || "analyst"];
    if (userLevel < ROLE_HIERARCHY[minRole]) {
      return res.status(403).json({
        error:    "Permissions insuffisantes",
        required: minRole,
        current:  req.admin?.role,
      });
    }
    next();
  };
};