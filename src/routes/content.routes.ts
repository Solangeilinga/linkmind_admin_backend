import { Router, Response } from "express";
import { param, body, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { Post, Comment, Professional } from "../models";
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
        .populate("author", "name anonymousAlias")
        .populate("professionalAuthor", "firstName lastName email type")
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

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTAIRES SIGNALÉS — même logique que les posts ci-dessus.
// ═══════════════════════════════════════════════════════════════════════════

router.get("/comments", async (req: AdminRequest, res: Response) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 15;

    const q = { reportCount: { $gt: 0 }, "reports.status": "pending" };

    const [comments, total] = await Promise.all([
      Comment.find(q)
        .populate("author", "name anonymousAlias")
        .populate("professionalAuthor", "firstName lastName email type")
        .populate("post", "content")
        .sort({ reportCount: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Comment.countDocuments(q),
    ]);

    res.json({ data: comments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Comments list error: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/comments/stats", async (_req: AdminRequest, res: Response) => {
  try {
    const [pending, hidden, total] = await Promise.all([
      Comment.countDocuments({ reportCount: { $gt: 0 }, "reports.status": "pending" }),
      Comment.countDocuments({ isVisible: false }),
      Comment.countDocuments({}),
    ]);
    res.json({ pending, hidden, total });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/comments/:id/dismiss",
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Comment.updateOne(
        { _id: req.params.id },
        { $set: { "reports.$[].status": "dismissed" } }
      );
      logger.info(`Comment report dismissed: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

router.post(
  "/comments/:id/hide",
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await Comment.updateOne(
        { _id: req.params.id },
        { isVisible: false, $set: { "reports.$[].status": "reviewed" } }
      );
      logger.warn(`Comment hidden: ${req.params.id} by ${req.admin?.email} — ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

router.delete(
  "/comments/:id",
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await Comment.deleteOne({ _id: req.params.id });
      logger.warn(`Comment deleted: ${req.params.id} by ${req.admin?.email} — ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// PROFESSIONNELS SIGNALÉS — pas de "hide"/"delete" (on ne masque/supprime
// jamais une fiche pro comme un post) : dismiss, suspend, reactivate.
// ═══════════════════════════════════════════════════════════════════════════

router.get("/professional-reports", async (req: AdminRequest, res: Response) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 15;

    const q = { reportCount: { $gt: 0 }, "reports.status": "pending" };

    const [professionals, total] = await Promise.all([
      Professional.find(q)
        .select("firstName lastName email type city isActive reportCount reports")
        .sort({ reportCount: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Professional.countDocuments(q),
    ]);

    res.json({ data: professionals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Professional reports list error: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/professional-reports/stats", async (_req: AdminRequest, res: Response) => {
  try {
    const [pending, suspended, total] = await Promise.all([
      Professional.countDocuments({ reportCount: { $gt: 0 }, "reports.status": "pending" }),
      Professional.countDocuments({ isActive: false }),
      Professional.countDocuments({}),
    ]);
    res.json({ pending, suspended, total });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/professional-reports/:id/dismiss",
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Professional.updateOne(
        { _id: req.params.id },
        { $set: { "reports.$[].status": "dismissed" } }
      );
      logger.info(`Professional report dismissed: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

router.post(
  "/professional-reports/:id/suspend",
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      await Professional.updateOne(
        { _id: req.params.id },
        { isActive: false, $set: { "reports.$[].status": "reviewed" } }
      );
      logger.warn(`Professional suspended: ${req.params.id} by ${req.admin?.email} — ${req.body.reason}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

router.post(
  "/professional-reports/:id/reactivate",
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Professional.updateOne({ _id: req.params.id }, { isActive: true });
      logger.info(`Professional reactivated: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

export default router;
