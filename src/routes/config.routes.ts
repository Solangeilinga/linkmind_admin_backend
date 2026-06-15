import { Router, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { AppConfig } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect);

// GET /api/config — liste toutes les configs (admin+)
router.get("/", requireRole("admin"), async (_req: AdminRequest, res: Response) => {
  try {
    const configs = await AppConfig.find().lean();
    res.json({ data: configs });
  } catch { res.status(500).json({ error: "Erreur serveur" }); }
});

// PATCH /api/config/:key — modifier une valeur (super_admin)
router.patch("/:key", requireRole("super_admin"),
  [
    param("key").notEmpty().trim(),
    body("value").notEmpty(),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const updated = await AppConfig.findOneAndUpdate(
        { key: req.params.key },
        { $set: { value: req.body.value } },
        { new: true, upsert: false }
      );
      if (!updated) return res.status(404).json({ error: "Clé introuvable" });
      logger.info(`AppConfig updated: ${req.params.key} by ${req.admin?.email}`);
      res.json({ data: updated });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  }
);

export default router;
