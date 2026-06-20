import { Router, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { protect, requireRole, AdminRequest } from "../middleware/auth.middleware";
import mongoose from "mongoose";
import logger from "../utils/logger";

// ── On importe les modèles depuis le backend principal ───────────────────────
// Le backend admin se connecte à la MÊME base MongoDB que le backend principal
// Donc on redéclare les schémas ici pour y accéder

const sf = new mongoose.Schema({ id: String, label: String, emoji: String, category: String, isActive: Boolean, order: Number }, { timestamps: true });
const dm = new mongoose.Schema({ text: String, emoji: String, category: String, isActive: Boolean }, { timestamps: true });
const wt = new mongoose.Schema({ moodId: String, emoji: String, title: String, description: String, actionPath: String, isActive: Boolean, order: Number }, { timestamps: true });
const md = new mongoose.Schema({ id: String, label: String, emoji: String, score: Number, colorHex: String, isActive: Boolean, order: Number }, { timestamps: true });
const pt = new mongoose.Schema({ id: String, label: String, emoji: String, colorHex: String, isActive: Boolean, order: Number }, { timestamps: true });
const cc = new mongoose.Schema({ id: String, label: String, labelPlural: String, emoji: String, colorHex: String, isActive: Boolean, order: Number }, { timestamps: true });
const cd = new mongoose.Schema({ id: String, label: String, colorHex: String, pointsMultiplier: Number, order: Number, isActive: Boolean }, { timestamps: true });
const ptt = new mongoose.Schema({ id: String, label: String, emoji: String, colorHex: String, isActive: Boolean, order: Number }, { timestamps: true });
const bg = new mongoose.Schema({ id: String, name: String, description: String, icon: String, condition: { type: String, threshold: Number }, isActive: Boolean, order: Number }, { timestamps: true });

const StressFactor        = mongoose.models.StressFactor        || mongoose.model('StressFactor',        sf);
const DailyMessage        = mongoose.models.DailyMessage        || mongoose.model('DailyMessage',        dm);
const WellnessTip         = mongoose.models.WellnessTip         || mongoose.model('WellnessTip',         wt);
const MoodDefinition      = mongoose.models.MoodDefinition      || mongoose.model('MoodDefinition',      md);
const ProfessionalType    = mongoose.models.ProfessionalType    || mongoose.model('ProfessionalType',    pt);
const ChallengeCategory   = mongoose.models.ChallengeCategory   || mongoose.model('ChallengeCategory',   cc);
const ChallengeDifficulty = mongoose.models.ChallengeDifficulty || mongoose.model('ChallengeDifficulty', cd);
const PostType            = mongoose.models.PostType            || mongoose.model('PostType',            ptt);
const Badge               = mongoose.models.Badge               || mongoose.model('Badge',               bg);

const router = Router();
router.use(protect, requireRole("admin"));

// ── Helper générique CRUD ─────────────────────────────────────────────────────
function crudRoutes(Model: mongoose.Model<any>, name: string) {
  // GET all
  router.get(`/${name}`, async (_req: AdminRequest, res: Response) => {
    try {
      const items = await Model.find().sort({ order: 1, createdAt: 1 }).lean();
      res.json(items);
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  });

  // POST create
  router.post(`/${name}`, async (req: AdminRequest, res: Response) => {
    try {
      const item = await Model.create(req.body);
      logger.info(`[SEED] ${name} created by ${req.admin?.email}`);
      res.status(201).json(item);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // PUT update
  router.put(`/${name}/:id`, param("id").isMongoId(), async (req: AdminRequest, res: Response) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ error: "Non trouvé" });
      res.json(item);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // DELETE
  router.delete(`/${name}/:id`, param("id").isMongoId(), async (req: AdminRequest, res: Response) => {
    try {
      await Model.findByIdAndDelete(req.params.id);
      logger.warn(`[SEED] ${name} deleted by ${req.admin?.email}`);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Erreur serveur" }); }
  });
}

// ── Enregistrement des routes CRUD pour chaque collection ────────────────────
crudRoutes(StressFactor,        'stress-factors');
crudRoutes(DailyMessage,        'daily-messages');
crudRoutes(WellnessTip,         'wellness-tips');
crudRoutes(MoodDefinition,      'mood-definitions');
crudRoutes(ProfessionalType,    'professional-types');
crudRoutes(ChallengeCategory,   'challenge-categories');
crudRoutes(ChallengeDifficulty, 'challenge-difficulties');
crudRoutes(PostType,            'post-types');
crudRoutes(Badge,               'badges');

// ── Seed initial (remet les données par défaut si collection vide) ────────────
router.post('/seed', async (req: AdminRequest, res: Response) => {
  try {
    const results: Record<string, number> = {};

    const seedIfEmpty = async (Model: mongoose.Model<any>, data: any[], name: string) => {
      const count = await Model.countDocuments();
      if (count === 0) {
        await Model.insertMany(data);
        results[name] = data.length;
      } else {
        results[name] = 0; // already seeded
      }
    };

    await seedIfEmpty(StressFactor, STRESS_FACTORS, 'stressFactors');
    await seedIfEmpty(DailyMessage, DAILY_MESSAGES, 'dailyMessages');
    await seedIfEmpty(WellnessTip,  WELLNESS_TIPS,  'wellnessTips');
    await seedIfEmpty(MoodDefinition, MOOD_DEFINITIONS, 'moodDefinitions');
    await seedIfEmpty(ProfessionalType, PROFESSIONAL_TYPES, 'professionalTypes');
    await seedIfEmpty(ChallengeCategory, CHALLENGE_CATEGORIES, 'challengeCategories');
    await seedIfEmpty(ChallengeDifficulty, CHALLENGE_DIFFICULTIES, 'challengeDifficulties');
    await seedIfEmpty(PostType, POST_TYPES, 'postTypes');
    await seedIfEmpty(Badge, BADGES, 'badges');

    logger.info(`[SEED] Initial seed by ${req.admin?.email}: ${JSON.stringify(results)}`);
    res.json({ success: true, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Données par défaut ────────────────────────────────────────────────────────
const STRESS_FACTORS = [
  { id: 'exams',      label: 'Examens',              emoji: '📚', category: 'academic',  order: 1, isActive: true },
  { id: 'homework',   label: 'Devoirs',              emoji: '✏️', category: 'academic',  order: 2, isActive: true },
  { id: 'deadline',   label: 'Délais',               emoji: '⏰', category: 'academic',  order: 3, isActive: true },
  { id: 'loneliness', label: 'Solitude',             emoji: '🌙', category: 'social',    order: 4, isActive: true },
  { id: 'conflict',   label: 'Conflits',             emoji: '⚡', category: 'social',    order: 5, isActive: true },
  { id: 'family',     label: 'Famille',              emoji: '🏠', category: 'social',    order: 6, isActive: true },
  { id: 'sleep',      label: 'Manque de sommeil',    emoji: '😴', category: 'health',    order: 7, isActive: true },
  { id: 'health',     label: 'Santé',                emoji: '🏥', category: 'health',    order: 8, isActive: true },
  { id: 'money',      label: 'Argent',               emoji: '💰', category: 'financial', order: 9, isActive: true },
  { id: 'future',     label: 'Avenir incertain',     emoji: '🔮', category: 'personal',  order: 10, isActive: true },
  { id: 'motivation', label: 'Manque de motivation', emoji: '🔋', category: 'personal',  order: 11, isActive: true },
  { id: 'other',      label: 'Autre',                emoji: '💭', category: 'other',     order: 12, isActive: true },
];

const DAILY_MESSAGES = [
  { text: "Chaque jour est une nouvelle chance de prendre soin de toi.",             emoji: '🌱', category: 'wellbeing',  isActive: true },
  { text: "Tu n'es pas seul(e). Des milliers de jeunes vivent les mêmes défis.",     emoji: '💙', category: 'motivation', isActive: true },
  { text: "Prendre soin de sa santé mentale, c'est aussi travailler son avenir.",    emoji: '✨', category: 'motivation', isActive: true },
  { text: "Une petite pause vaut mieux qu'un grand épuisement.",                      emoji: '🌿', category: 'wellbeing',  isActive: true },
  { text: "Le courage, c'est aussi demander de l'aide quand on en a besoin.",        emoji: '🤝', category: 'courage',    isActive: true },
  { text: "Respire. Tu gères mieux que tu ne le crois.",                              emoji: '💪', category: 'wellbeing',  isActive: true },
  { text: "Ton bien-être est une priorité, pas un luxe.",                             emoji: '🌸', category: 'wellbeing',  isActive: true },
  { text: "Aujourd'hui, choisis une chose qui te fait du bien.",                      emoji: '☀️', category: 'wellbeing',  isActive: true },
];

const MOOD_DEFINITIONS = [
  { id: 'great',    label: 'Super bien',  emoji: '😄', score: 5, colorHex: '#2ECC71', order: 1, isActive: true },
  { id: 'good',     label: 'Bien',        emoji: '🙂', score: 4, colorHex: '#27AE60', order: 2, isActive: true },
  { id: 'neutral',  label: 'Neutre',      emoji: '😐', score: 3, colorHex: '#F5B731', order: 3, isActive: true },
  { id: 'tired',    label: 'Fatigué(e)',  emoji: '😔', score: 2, colorHex: '#E07B2A', order: 4, isActive: true },
  { id: 'stressed', label: 'Stressé(e)', emoji: '😰', score: 1, colorHex: '#77021D', order: 5, isActive: true },
  { id: 'anxious',  label: 'Anxieux(se)',emoji: '😟', score: 1, colorHex: '#C93B2B', order: 6, isActive: true },
  { id: 'sad',      label: 'Triste',      emoji: '😢', score: 2, colorHex: '#8A7070', order: 7, isActive: true },
];

const PROFESSIONAL_TYPES = [
  { id: 'psychologist', label: 'Psychologue',  labelPlural: 'Psychologues',  emoji: '🧠', colorHex: '#77021D', order: 1, isActive: true },
  { id: 'coach',        label: 'Coach',         labelPlural: 'Coachs',         emoji: '💪', colorHex: '#F5B731', order: 2, isActive: true },
  { id: 'doctor',       label: 'Médecin',       labelPlural: 'Médecins',       emoji: '🩺', colorHex: '#27AE60', order: 3, isActive: true },
  { id: 'counselor',    label: 'Conseiller',    labelPlural: 'Conseillers',    emoji: '🤝', colorHex: '#2980B9', order: 4, isActive: true },
];

const CHALLENGE_CATEGORIES = [
  { id: 'breathing',   label: 'Respiration',   labelPlural: 'Respirations',   emoji: '🌬️', colorHex: '#3498DB', order: 1, isActive: true },
  { id: 'mindfulness', label: 'Pleine conscience', labelPlural: 'Pleine conscience', emoji: '🧘', colorHex: '#9B59B6', order: 2, isActive: true },
  { id: 'movement',    label: 'Mouvement',     labelPlural: 'Mouvements',     emoji: '🚶', colorHex: '#27AE60', order: 3, isActive: true },
  { id: 'social',      label: 'Social',        labelPlural: 'Sociaux',        emoji: '🤝', colorHex: '#E67E22', order: 4, isActive: true },
  { id: 'gratitude',   label: 'Gratitude',     labelPlural: 'Gratitudes',     emoji: '🙏', colorHex: '#F5B731', order: 5, isActive: true },
  { id: 'sleep',       label: 'Sommeil',       labelPlural: 'Sommeil',        emoji: '😴', colorHex: '#2C3E50', order: 6, isActive: true },
];

const CHALLENGE_DIFFICULTIES = [
  { id: 'easy',   label: 'Facile',  colorHex: '#27AE60', pointsMultiplier: 1,   order: 1, isActive: true },
  { id: 'medium', label: 'Moyen',   colorHex: '#F5B731', pointsMultiplier: 1.5, order: 2, isActive: true },
  { id: 'hard',   label: 'Difficile', colorHex: '#E74C3C', pointsMultiplier: 2, order: 3, isActive: true },
];

const POST_TYPES = [
  { id: 'general',             label: 'Général',             emoji: '💬', colorHex: '#77021D', order: 1, isActive: true },
  { id: 'mood_share',          label: 'Humeur partagée',     emoji: '😊', colorHex: '#F5B731', order: 2, isActive: true },
  { id: 'support',             label: 'Soutien',             emoji: '🤝', colorHex: '#27AE60', order: 3, isActive: true },
  { id: 'question',            label: 'Question',            emoji: '❓', colorHex: '#3498DB', order: 4, isActive: true },
  { id: 'tip',                 label: 'Conseil',             emoji: '💡', colorHex: '#9B59B6', order: 5, isActive: true },
  { id: 'challenge_completed', label: 'Défi complété',       emoji: '🏆', colorHex: '#E67E22', order: 6, isActive: true },
];

const BADGES = [
  { id: 'first_mood',    name: 'Premier pas',         icon: '🌱', description: 'Enregistre ton humeur pour la première fois', condition: { type: 'mood_count',      threshold: 1    }, order: 1, isActive: true },
  { id: 'mood_7days',    name: 'Observateur',          icon: '📊', description: "Enregistre l'humeur 7 jours d'affilée",        condition: { type: 'mood_count',      threshold: 7    }, order: 2, isActive: true },
  { id: 'streak_7',      name: 'Régularité 7J',        icon: '🔥', description: "7 jours de suite d'activité",                 condition: { type: 'streak_days',     threshold: 7    }, order: 3, isActive: true },
  { id: 'streak_30',     name: "Maître de l'habitude", icon: '💎', description: '30 jours consécutifs',                        condition: { type: 'streak_days',     threshold: 30   }, order: 4, isActive: true },
  { id: 'challenges_5',  name: 'Actif',                icon: '⚡', description: 'Complète 5 défis',                            condition: { type: 'challenge_count', threshold: 5    }, order: 5, isActive: true },
  { id: 'challenges_20', name: 'Motivé(e)',             icon: '🏆', description: 'Complète 20 défis',                           condition: { type: 'challenge_count', threshold: 20   }, order: 6, isActive: true },
  { id: 'points_500',    name: 'Niveau Argent',         icon: '🥈', description: "Atteins 500 points",                          condition: { type: 'points',          threshold: 500  }, order: 7, isActive: true },
  { id: 'points_1000',   name: 'Niveau Or',             icon: '🥇', description: "Atteins 1000 points",                         condition: { type: 'points',          threshold: 1000 }, order: 8, isActive: true },
];

const WELLNESS_TIPS = [
  { moodId: 'stressed', emoji: '🌬️', title: 'Respiration 4-7-8',   description: 'Expire le stress en 3 minutes',        actionPath: '/challenges', order: 1, isActive: true },
  { moodId: 'stressed', emoji: '✍️', title: 'Vide ton esprit',      description: 'Écris tes pensées pour les libérer',   actionPath: null,          order: 2, isActive: true },
  { moodId: 'anxious',  emoji: '🌬️', title: 'Respiration carrée',  description: 'Stabilise ton système nerveux',        actionPath: '/challenges', order: 1, isActive: true },
  { moodId: 'anxious',  emoji: '👁️', title: 'Méthode 5-4-3-2-1',   description: 'Nomme 5 choses autour de toi',         actionPath: null,          order: 2, isActive: true },
  { moodId: 'tired',    emoji: '😴', title: 'Micro-sieste 20 min',  description: 'Recharge sans perturber la nuit',     actionPath: null,          order: 1, isActive: true },
  { moodId: 'sad',      emoji: '🤝', title: "Tu n'es pas seul(e)",  description: 'La communauté est là pour toi',       actionPath: '/community',  order: 1, isActive: true },
  { moodId: 'neutral',  emoji: '🎯', title: 'Pose 3 objectifs',     description: "Petits, concrets, pour aujourd'hui",  actionPath: null,          order: 1, isActive: true },
  { moodId: 'good',     emoji: '⚡', title: 'Lance un défi',        description: 'Profite de cette énergie',            actionPath: '/challenges', order: 1, isActive: true },
  { moodId: 'great',    emoji: '🚀', title: 'Lance un grand défi',  description: 'Tu es au top, profites-en !',         actionPath: '/challenges', order: 1, isActive: true },
];

export default router;