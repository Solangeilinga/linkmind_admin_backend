import { Router, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { Ad } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect);

const CATEGORIES  = ["prevention", "wellness", "local_product", "event", "service"];
const PLACEMENTS  = ["community_feed", "mood_screen", "challenges_screen"];

// GET /api/ads
router.get("/", requireRole("admin"), async (req: AdminRequest, res: Response) => {
  try {
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 20;
    const filter: any = {};
    if (req.query.active !== undefined) filter.isActive = req.query.active === "true";

    const [ads, total] = await Promise.all([
      Ad.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Ad.countDocuments(filter),
    ]);
    res.json({ data: ads, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Ads list: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/ads/stats
router.get("/stats", requireRole("admin"), async (_req: AdminRequest, res: Response) => {
  try {
    const [total, active] = await Promise.all([
      Ad.countDocuments(),
      Ad.countDocuments({ isActive: true }),
    ]);
    const agg = await Ad.aggregate([
      { $group: { _id: null, impressions: { $sum: "$impressions" }, clicks: { $sum: "$clicks" } } },
    ]);
    res.json({
      total, active,
      impressions: agg[0]?.impressions || 0,
      clicks:      agg[0]?.clicks || 0,
    });
  } catch { res.status(500).json({ error: "Erreur serveur" }); }
});

// GET /api/ads/:id
router.get("/:id", requireRole("admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const ad = await Ad.findById(req.params.id).lean();
      if (!ad) return res.status(404).json({ error: "Annonce introuvable" });
      res.json({ data: ad });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// POST /api/ads — Créer (super_admin)
router.post("/", requireRole("super_admin"),
  [
    body("title").notEmpty().trim().isLength({ max: 60 }),
    body("description").optional().trim().isLength({ max: 120 }),
    body("category").isIn(CATEGORIES),
    body("placement").isArray().custom((v: string[]) =>
      v.every((p: string) => PLACEMENTS.includes(p))
    ),
    body("advertiser").optional().trim(),
    body("ctaUrl").optional().isURL(),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const ad = await Ad.create({ ...req.body });
      logger.info(`Ad created: "${req.body.title}" by ${req.admin?.email}`);
      res.status(201).json({ data: ad });
    } catch (err) {
      logger.error("Ad create: " + err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// PATCH /api/ads/:id (super_admin)
router.patch("/:id", requireRole("super_admin"), param("id").isMongoId(),
  [
    body("title").optional().trim().isLength({ max: 60 }),
    body("description").optional().trim().isLength({ max: 120 }),
    body("category").optional().isIn(CATEGORIES),
    body("placement").optional().isArray().custom((v: string[]) =>
      v.every((p: string) => PLACEMENTS.includes(p))
    ),
    body("advertiser").optional().trim(),
    body("ctaUrl").optional().isURL(),
    body("ctaLabel").optional().trim().isLength({ max: 30 }),
    body("isActive").optional().isBoolean(),
    body("startsAt").optional().isISO8601(),
    body("endsAt").optional().isISO8601(),
    body("targetAgeMin").optional().isInt({ min: 0 }),
    body("targetAgeMax").optional().isInt({ min: 0 }),
    body("targetCity").optional().trim(),
    body("emoji").optional().trim(),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const ALLOWED = ["title","description","category","placement","advertiser","ctaUrl","ctaLabel","isActive","startsAt","endsAt","targetAgeMin","targetAgeMax","targetCity","emoji","imageUrl"];
    const update: any = {};
    ALLOWED.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    try {
      const updated = await Ad.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
      if (!updated) return res.status(404).json({ error: "Annonce introuvable" });
      logger.info(`Ad updated: ${req.params.id} by ${req.admin?.email}`);
      res.json({ data: updated });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// PATCH /api/ads/:id/toggle (admin)
router.patch("/:id/toggle", requireRole("admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const ad = await Ad.findById(req.params.id);
      if (!ad) return res.status(404).json({ error: "Annonce introuvable" });
      ad.isActive = !ad.isActive;
      await ad.save();
      logger.info(`Ad toggled: ${req.params.id} → ${ad.isActive} by ${req.admin?.email}`);
      res.json({ data: { isActive: ad.isActive } });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

// DELETE /api/ads/:id (super_admin)
router.delete("/:id", requireRole("super_admin"), param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      await Ad.findByIdAndDelete(req.params.id);
      logger.warn(`Ad deleted: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

export default router;
