import { Router, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { Challenge } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect);

const CATEGORIES = ["mindfulness", "breathing", "gratitude", "movement", "social", "reflection", "sleep"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const COMPLETION_TYPES = ["timer", "action", "reflection", "social", "exploration"];

// GET /api/challenges?page=1&limit=20&active=true
router.get("/", requireRole("admin"), async (req: AdminRequest, res: Response) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const filter: any = {};
    if (req.query.active !== undefined) filter.isActive = req.query.active === "true";
    if (req.query.category) filter.category = req.query.category;

    const [challenges, total] = await Promise.all([
      Challenge.find(filter).sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      Challenge.countDocuments(filter),
    ]);
    res.json({ data: challenges, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Challenges list: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/challenges/:id
router.get("/:id", requireRole("admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const c = await Challenge.findById(req.params.id).lean();
      if (!c) return res.status(404).json({ error: "Défi introuvable" });
      res.json({ data: c });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// POST /api/challenges — Créer (super_admin seulement)
router.post("/", requireRole("super_admin"),
  [
    body("title").notEmpty().trim(),
    body("description").notEmpty().trim(),
    body("category").isIn(CATEGORIES),
    body("difficulty").optional().isIn(DIFFICULTIES),
    body("durationMinutes").isInt({ min: 1 }),
    body("points").isInt({ min: 1 }),
    body("icon").notEmpty(),
    body("completionType.type").isIn(COMPLETION_TYPES),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const challenge = await Challenge.create({ ...req.body });
      logger.info(`Challenge created: "${req.body.title}" by ${req.admin?.email}`);
      res.status(201).json({ data: challenge });
    } catch (err) {
      logger.error("Challenge create: " + err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// PATCH /api/challenges/:id — Modifier (super_admin)
router.patch("/:id", requireRole("super_admin"), param("id").isMongoId(),
  [
    body("title").optional().trim(),
    body("description").optional().trim(),
    body("category").optional().isIn(CATEGORIES),
    body("difficulty").optional().isIn(DIFFICULTIES),
    body("durationMinutes").optional().isInt({ min: 1 }),
    body("points").optional().isInt({ min: 1 }),
    body("icon").optional().trim(),
    body("isPremium").optional().isBoolean(),
    body("isActive").optional().isBoolean(),
    body("order").optional().isInt({ min: 0 }),
    body("completionType.type").optional().isIn(COMPLETION_TYPES),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const ALLOWED = ["title","description","category","difficulty","durationMinutes","points","icon","isPremium","isActive","order","completionType","instructions","targetLevel"];
    const update: any = {};
    ALLOWED.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    try {
      const updated = await Challenge.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
      if (!updated) return res.status(404).json({ error: "Défi introuvable" });
      logger.info(`Challenge updated: ${req.params.id} by ${req.admin?.email}`);
      res.json({ data: updated });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// PATCH /api/challenges/:id/toggle — Activer/Désactiver (admin)
router.patch("/:id/toggle", requireRole("admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const c = await Challenge.findById(req.params.id);
      if (!c) return res.status(404).json({ error: "Défi introuvable" });
      c.isActive = !c.isActive;
      await c.save();
      logger.info(`Challenge toggled: ${req.params.id} → ${c.isActive} by ${req.admin?.email}`);
      res.json({ data: { isActive: c.isActive } });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// DELETE /api/challenges/:id — Supprimer (super_admin)
router.delete("/:id", requireRole("super_admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Challenge.findByIdAndDelete(req.params.id);
      logger.warn(`Challenge deleted: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

export default router;
