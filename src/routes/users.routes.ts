import { Router, Response } from "express";
import { param, query, body, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { User } from "../models";
import bcrypt from "bcryptjs";
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
    query("filter").optional().isIn(["all", "active", "deleted", "new"]),
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
      if (filter === "deleted") q.deletedAt = { $ne: null };
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

// POST /api/users/:id/soft-delete — suppression douce (3 étapes côté frontend)
router.post(
  "/:id/soft-delete",
  requireRole("admin"),
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await User.findByIdAndUpdate(req.params.id, {
        isActive: false,
        deletedAt: new Date(),
        banReason: req.body.reason,
      });
      logger.warn(`[ADMIN] User soft-deleted: ${req.params.id} by ${req.admin?.email} — reason: ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/users/:id/restore — restaurer un compte supprimé
router.post(
  "/:id/restore",
  requireRole("admin"),
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await User.findByIdAndUpdate(req.params.id, {
        isActive: true, deletedAt: null, banReason: undefined,
      });
      logger.info(`[ADMIN] User restored: ${req.params.id} by ${req.admin?.email}`);
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

// POST /api/users — Créer un utilisateur manuellement
router.post(
  "/",
  requireRole("admin"),
  [
    body("email").isEmail().normalizeEmail().withMessage("Email valide requis"),
    body("password").isLength({ min: 6 }).withMessage("Mot de passe min 6 caractères"),
    body("anonymousAlias").optional().trim(),
    body("age").optional().isInt({ min: 13, max: 120 }),
    body("city").optional().trim(),
    body("country").optional().trim(),
    body("gender").optional().isIn(["homme", "femme", "non_specifie"]),
    body("role").optional().isIn(["user", "moderator"]),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { email, password, anonymousAlias, age, city, country, gender, role } = req.body;

      // Vérifier doublon email
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ error: "Cet email est déjà utilisé." });

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        anonymousAlias: anonymousAlias || null,
        age:     age     || null,
        city:    city    || null,
        country: country || null,
        gender:  gender  || null,
        isEmailVerified: true,   // Créé par admin = vérifié
        isActive: true,
        legalAccepted: true,
        legalAcceptedAt: new Date(),
      });

      logger.info(`[ADMIN] User created: ${user.email} by ${req.admin?.email}`);
      res.status(201).json({
        _id: user._id,
        email: user.email,
        anonymousAlias: user.anonymousAlias,
        createdAt: user.createdAt,
      });
    } catch (e: any) {
      logger.error("User create error: " + e.message);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

export default router;