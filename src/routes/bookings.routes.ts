import { Router, Response } from "express";
import { param, body, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import { Booking, Professional } from "../models";
import logger from "../utils/logger";

const router = Router();
router.use(protect);

// GET /api/bookings
router.get("/", requireRole("analyst"), async (req: AdminRequest, res: Response) => {
  try {
    const page   = Number(req.query.page)  || 1;
    const limit  = Number(req.query.limit) || 20;
    const status = req.query.status as string | undefined;

    const q: any = {};
    if (status && status !== "all") q.status = status;

    const [bookings, total] = await Promise.all([
      Booking.find(q)
        .populate("user",         "name email")
        .populate("professional", "firstName lastName type city sessionPrice currency photo")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Booking.countDocuments(q),
    ]);

    res.json({ data: bookings, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("Bookings list error: " + err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/bookings/stats
router.get("/stats", requireRole("analyst"), async (_req: AdminRequest, res: Response) => {
  try {
    const [pending, confirmed, cancelled, completed, total] = await Promise.all([
      Booking.countDocuments({ status: "pending" }),
      Booking.countDocuments({ status: "confirmed" }),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments(),
    ]);

    const agg = await Booking.aggregate([
      { $match: { status: { $in: ["confirmed", "completed"] }, commissionAmount: { $ne: null } } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);

    res.json({
      pending, confirmed, cancelled, completed, total,
      totalCommission: agg[0]?.total || 0,
    });
  } catch {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/bookings/:id
router.get(
  "/:id",
  requireRole("analyst"),
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const booking = await Booking.findById(req.params.id)
        .populate("user",         "name email createdAt")
        .populate("professional", "firstName lastName type city phone email sessionPrice currency photo specialties")
        .lean();
      if (!booking) return res.status(404).json({ error: "Réservation introuvable" });
      res.json({ data: booking });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/bookings/:id/confirm
router.post(
  "/:id/confirm",
  requireRole("moderator"),
  [
    param("id").isMongoId(),
    body("adminNote").optional().trim(),
    body("sessionPrice").optional().isNumeric(),
  ],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: "Réservation introuvable" });
      if (booking.status !== "pending")
        return res.status(400).json({ error: `Impossible de confirmer une réservation "${booking.status}"` });

      const price      = req.body.sessionPrice || booking.sessionPrice;
      const commission = price ? Math.round(price * booking.commissionRate) : null;

      await Booking.findByIdAndUpdate(req.params.id, {
        status:           "confirmed",
        confirmedAt:      new Date(),
        adminNote:        req.body.adminNote || undefined,
        sessionPrice:     price,
        commissionAmount: commission,
      });

      await Professional.findByIdAndUpdate(booking.professional, { $inc: { totalBookings: 1 } });

      logger.info(`Booking confirmed: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true, commissionAmount: commission });
    } catch (err) {
      logger.error("Booking confirm error: " + err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// POST /api/bookings/:id/cancel
router.post(
  "/:id/cancel",
  requireRole("moderator"),
  [param("id").isMongoId(), body("reason").notEmpty().trim()],
  async (req: AdminRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: "Réservation introuvable" });
      if (booking.status === "completed")
        return res.status(400).json({ error: "Impossible d'annuler une réservation terminée" });

      await Booking.findByIdAndUpdate(req.params.id, {
        status:      "cancelled",
        cancelledAt: new Date(),
        adminNote:   req.body.reason,
      });
      logger.warn(`Booking cancelled: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

// PATCH /api/bookings/:id/complete
router.patch(
  "/:id/complete",
  requireRole("moderator"),
  param("id").isMongoId(),
  async (req: AdminRequest, res: Response) => {
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ error: "Réservation introuvable" });
      if (booking.status !== "confirmed")
        return res.status(400).json({ error: "Seules les réservations confirmées peuvent être terminées" });

      await Booking.findByIdAndUpdate(req.params.id, { status: "completed" });
      logger.info(`Booking completed: ${req.params.id} by ${req.admin?.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

export default router;
