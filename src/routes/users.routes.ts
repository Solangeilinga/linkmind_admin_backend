import { Router, Response } from "express";
import { param, query, body, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { User } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect);

// GET /api/users
router.get(
  "/",
  requireRole("analyst"),
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("search").optional().trim().escape(),
    query("filter").optional().isIn(["all", "active", "banned", "new"]),
  ],
  async (req: AdminRequest, res: Response) => {
    try {
      const page   = Number(req.query.page)  || 1;
      const limit  = Number(req.query.limit) || 20;
      const search = req.query.search as string | undefined;
      const filter = (req.query.filter as string) || "all";

      const q: any = { isAdmin: { $ne: true } };
      if (search) {
        q.$or = [
          { name:  { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      if (filter === "active") q.isActive = true;
      if (filter === "banned") q.isBanned = true;
      if (filter === "new") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        q.createdAt = { $gte: d };
      }

      const [users, total] = await Promise.all([
        User.find(q)
          .select("-password -fcmToken")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        User.countDocuments(q),
      ]);

      res.json({ data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) {
      logger.error("Users list error: " + err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// GET /api/users/:id
router.get(
  "/:id",
  requireRole("analyst"),
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const user = await User.findById(req.params.id).select("-password -fcmToken").lean();
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      res.json({ data: user });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/users/:id/ban
router.post(
  "/:id/ban",
  requireRole("moderator"),
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await User.findByIdAndUpdate(req.params.id, {
        isBanned: true, isActive: false, banReason: req.body.reason,
      });
      logger.warn(`User banned: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/users/:id/unban
router.post(
  "/:id/unban",
  requireRole("moderator"),
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await User.findByIdAndUpdate(req.params.id, {
        isBanned: false, isActive: true, banReason: undefined,
      });
      logger.info(`User unbanned: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// DELETE /api/users/:id (anonymisation RGPD)
router.delete(
  "/:id",
  requireRole("super_admin"),
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await User.findByIdAndUpdate(req.params.id, {
        name:     "[Compte supprimé]",
        email:    `deleted_${req.params.id}@anonymized.local`,
        isActive: false,
        isBanned: true,
        fcmToken: undefined,
      });
      logger.warn(`User anonymized: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

export default router;
