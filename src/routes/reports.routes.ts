import { Router, Response } from "express";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { User } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect, requireRole("analyst"));

// GET /api/reports/dashboard
router.get("/dashboard", async (_req: AdminRequest, res: Response) => {
  try {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week  = new Date(today);
    week.setDate(today.getDate() - 7);

    const [total, active, banned, newToday, newWeek] = await Promise.all([
      User.countDocuments({ isAdmin: { $ne: true } }),
      User.countDocuments({ isActive: true,  isAdmin: { $ne: true } }),
      User.countDocuments({ isBanned: true,  isAdmin: { $ne: true } }),
      User.countDocuments({ createdAt: { $gte: today }, isAdmin: { $ne: true } }),
      User.countDocuments({ createdAt: { $gte: week  }, isAdmin: { $ne: true } }),
    ]);

    res.json({
      users:  { total, active, banned, newToday, newWeek },
      system: { uptime: process.uptime(), timestamp: now },
    });
  } catch (err) {
    logger.error("Dashboard error: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/reports/users/growth — 30 derniers jours
router.get("/users/growth", async (_req: AdminRequest, res: Response) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const data = await User.aggregate([
      { $match: { createdAt: { $gte: since }, isAdmin: { $ne: true } } },
      {
        $group: {
          _id:   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ data });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
