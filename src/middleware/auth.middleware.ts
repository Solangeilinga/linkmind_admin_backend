import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'analyst';

const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 4,
  admin:       3,
  moderator:   2,
  analyst:     1,
};

export interface AdminRequest extends Request {
  admin?: { id: string; email: string; role: AdminRole };
  // Redéclaration explicite pour éviter les erreurs TS2339
  body:    any;
  params:  Record<string, string>;
  query:   Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}

export const protect = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    res.status(401).json({ error: 'Token manquant' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET non configuré');
    res.status(500).json({ error: 'Configuration serveur manquante' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      id: string;
      email: string;
      isAdmin?: boolean;
      adminRole?: AdminRole;
    };

    if (!decoded.isAdmin || !decoded.adminRole) {
      res.status(403).json({ error: 'Accès réservé aux administrateurs' });
      return;
    }

    req.admin = {
      id:    decoded.id,
      email: decoded.email,
      role:  decoded.adminRole,
    };
    next();
  } catch (err: any) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide';
    res.status(401).json({ error: msg, code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' });
  }
};

export const requireRole = (minRole: AdminRole) => (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.admin) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }
  if (ROLE_HIERARCHY[req.admin.role] < ROLE_HIERARCHY[minRole]) {
    res.status(403).json({
      error: `Rôle insuffisant. Requis : ${minRole}, actuel : ${req.admin.role}`,
    });
    return;
  }
  next();
};