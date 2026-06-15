import { Router, Response } from "express";
import { param, body, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { Post } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect, requireRole("moderator"));

// GET /api/content — Posts signalés
router.get("/", async (req: AdminRequest, res: Response) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 15;

    const q = {
      reportCount:       { $gt: 0 },
      deletedAt:         null,
      "reports.status":  "pending",
    };

    const [posts, total] = await Promise.all([
      Post.find(q)
        .populate("author", "name email")
        .sort({ reportCount: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments(q),
    ]);

    res.json({ data: posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Content list error: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/content/stats
router.get("/stats", async (_req: AdminRequest, res: Response) => {
  try {
    const [pending, hidden, total] = await Promise.all([
      Post.countDocuments({ reportCount: { $gt: 0 }, deletedAt: null, "reports.status": "pending" }),
      Post.countDocuments({ isVisible: false, deletedAt: null }),
      Post.countDocuments({ deletedAt: null }),
    ]);
    res.json({ pending, hidden, total });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/content/:id/dismiss — Rejeter signalement, post conservé
router.post(
  "/:id/dismiss",
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Post.updateOne(
        { _id: req.params.id },
        { $set: { "reports.$[].status": "dismissed" } }
      );
      logger.info(`Reports dismissed: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/content/:id/hide — Masquer le post
router.post(
  "/:id/hide",
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await Post.updateOne(
        { _id: req.params.id },
        {
          isVisible: false,
          $set: { "reports.$[].status": "reviewed" },
        }
      );
      logger.warn(`Post hidden: ${req.params.id} by ${req.admin?.email} — ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// DELETE /api/content/:id — Supprimer définitivement
router.delete(
  "/:id",
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await Post.updateOne(
        { _id: req.params.id },
        {
          isVisible: false,
          deletedAt: new Date(),
          $set: { "reports.$[].status": "reviewed" },
        }
      );
      logger.warn(`Post deleted: ${req.params.id} by ${req.admin?.email} — ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

export default router;
