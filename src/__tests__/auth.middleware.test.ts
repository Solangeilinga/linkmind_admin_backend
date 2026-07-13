/**
 * Tests — auth.middleware.ts
 *
 * Couvre :
 *  - protect() : token manquant, invalide, expiré, non-admin, valide
 *  - requireRole() : hiérarchie des rôles (analyst < moderator < admin < super_admin)
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET!;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeToken(payload: object, secret = JWT_SECRET, options: jwt.SignOptions = {}) {
  return jwt.sign(payload, secret, { expiresIn: "1h", ...options });
}

function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockNext(): NextFunction {
  return jest.fn();
}

// ─── protect() ───────────────────────────────────────────────────────────────

describe("protect middleware", () => {

  it("rejette si aucun header Authorization", () => {
    const req = { headers: {} } as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Token manquant" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejette un token signé avec un mauvais secret", () => {
    const token = makeToken({ id: "abc", email: "a@b.com", isAdmin: true, adminRole: "admin" }, "wrong-secret");
    const req = { headers: { authorization: `Bearer ${token}` } } as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Token invalide" }));
  });

  it("rejette un token expiré", () => {
    const token = makeToken(
      { id: "abc", email: "a@b.com", isAdmin: true, adminRole: "admin" },
      JWT_SECRET,
      { expiresIn: -1 }   // déjà expiré
    );
    const req = { headers: { authorization: `Bearer ${token}` } } as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      error: "Token expiré",
      code:  "TOKEN_EXPIRED",
    });
  });

  it("rejette un token valide mais sans isAdmin", () => {
    const token = makeToken({ id: "abc", email: "user@b.com", isAdmin: false });
    const req = { headers: { authorization: `Bearer ${token}` } } as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("accepte un token admin valide et peuple req.admin", () => {
    const token = makeToken({ id: "abc123", email: "admin@basyam.app", isAdmin: true, adminRole: "admin" });
    const req = { headers: { authorization: `Bearer ${token}` } } as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    protect(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.admin).toMatchObject({ id: "abc123", email: "admin@basyam.app", role: "admin" });
  });
});

// ─── requireRole() ───────────────────────────────────────────────────────────

describe("requireRole middleware", () => {

  function makeAdminReq(role: string): AdminRequest {
    return { admin: { id: "x", email: "x@x.com", role } } as AdminRequest;
  }

  it("bloque un analyst qui tente une route admin", () => {
    const req = makeAdminReq("analyst");
    const res = mockRes();
    const next = mockNext();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("autorise un admin pour une route moderator", () => {
    const req = makeAdminReq("admin");
    const res = mockRes();
    const next = mockNext();

    requireRole("moderator")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("autorise super_admin pour toutes les routes", () => {
    const roles = ["analyst", "moderator", "admin", "super_admin"] as const;
    roles.forEach(minRole => {
      const req = makeAdminReq("super_admin");
      const res = mockRes();
      const next = mockNext();
      requireRole(minRole)(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  it("rejette si req.admin n'est pas défini", () => {
    const req = {} as AdminRequest;
    const res = mockRes();
    const next = mockNext();

    requireRole("analyst")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  // Hiérarchie complète : analyst(1) < moderator(2) < admin(3) < super_admin(4)
  it.each([
    ["analyst",    "moderator",   false],
    ["analyst",    "admin",       false],
    ["moderator",  "admin",       false],
    ["moderator",  "moderator",   true],
    ["admin",      "admin",       true],
    ["admin",      "super_admin", false],
    ["super_admin","super_admin", true],
  ])("%s accédant à une route %s : autorisé=%s", (role, minRole, shouldPass) => {
    const req = makeAdminReq(role);
    const res = mockRes();
    const next = mockNext();

    requireRole(minRole as any)(req, res, next);

    if (shouldPass) {
      expect(next).toHaveBeenCalledTimes(1);
    } else {
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });
});