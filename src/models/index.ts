import mongoose, { Schema, Document } from "mongoose";

// ─── User ────────────────────────────────────────────────────
// Le modèle User est défini dans user.shared.ts (source de vérité admin).
// Toute modification du schéma User doit être faite dans ce fichier.
export { User, IUser, AdminRole, UserLevel, AccountStatus } from "./user.shared";

// ─── Professional ────────────────────────────────────────────

// Sous-schéma créneau (identique au backend principal)
const SlotSchema = new Schema(
  {
    _id:       { type: String, required: true }, // "YYYY-MM-DD_HH:MM"
    date:      { type: String, required: true },
    startTime: { type: String, required: true },
    endTime:   { type: String, required: true },
    isBooked:  { type: Boolean, default: false },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", default: null },
  }
  // Note: { _id: false } retiré — il empêchait la sauvegarde du _id String personnalisé
);

// Sous-schéma disponibilités récurrentes
const WeeklyAvailabilitySchema = new Schema(
  {
    dayOfWeek:    { type: Number, min: 0, max: 6, required: true },
    startTime:    { type: String, required: true },
    endTime:      { type: String, required: true },
    slotDuration: { type: Number, default: 60 },
  },
  { _id: false }
);

export interface ISlot {
  _id: string;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  bookingId?: mongoose.Types.ObjectId | null;
}

export interface IWeeklyAvailability {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
}

export interface IProfessional extends Document {
  firstName?: string;
  lastName?: string;
  photo?: string;
  bio?: string;
  type?: string;
  specialties?: string[];
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  sessionPrice?: number;
  sessionDuration?: number;
  currency?: string;
  isOnline?: boolean;
  isInPerson?: boolean;
  // Agenda
  availableSlots?: ISlot[];
  weeklyAvailability?: IWeeklyAvailability[];
  // Visio
  personalMeetingLink?: string | null;
  meetingProvider?: "jitsi" | "whereby" | "zoom" | "meet" | null;
  // Statut
  isActive?: boolean;
  isVerified?: boolean;
  totalBookings?: number;
  rating?: number;
}

const ProfessionalSchema = new Schema<IProfessional>(
  {
    firstName:       { type: String },
    lastName:        { type: String },
    photo:           { type: String },
    bio:             { type: String },
    type:            { type: String },
    specialties:     [{ type: String }],
    city:            { type: String },
    country:         { type: String, default: "Burkina Faso" },
    phone:           { type: String },
    email:           { type: String },
    whatsapp:        { type: String },
    sessionPrice:    { type: Number },
    sessionDuration: { type: Number, default: 60 },
    currency:        { type: String, default: "FCFA" },
    isOnline:        { type: Boolean, default: false },
    isInPerson:      { type: Boolean, default: true },
    availableSlots:      [SlotSchema],
    weeklyAvailability:  [WeeklyAvailabilitySchema],
    personalMeetingLink: { type: String, default: null },
    meetingProvider:     { type: String, enum: ["jitsi", "whereby", "zoom", "meet", null], default: null },
    isActive:      { type: Boolean },
    isVerified:    { type: Boolean },
    totalBookings: { type: Number, default: 0 },
    rating:        { type: Number },
  },
  { collection: "professionals", timestamps: true }
);

export const Professional = mongoose.models.Professional
  ? (mongoose.model("Professional") as mongoose.Model<IProfessional>)
  : mongoose.model<IProfessional>("Professional", ProfessionalSchema);

// ─── Booking ─────────────────────────────────────────────────
export interface IBooking extends Document {
  user:             mongoose.Types.ObjectId;
  professional:     mongoose.Types.ObjectId;
  consultationType: "in_person" | "online";

  // Planification (champs du backend principal)
  scheduledAt?:    Date | null;
  slotId?:         string | null;
  durationMin?:    number;
  preferredDate?:  string | null;

  // Visioconférence
  meetingLink?:     string | null;
  meetingProvider?: "jitsi" | "whereby" | "zoom" | "meet" | null;
  meetingRoomId?:   string | null;

  // Message (stocké chiffré côté backend principal — lu déchiffré via populate)
  message?:         string;
  isAnonymous?:     boolean;

  // Statut — inclut "no_show" présent dans le backend principal
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

  // Finance
  sessionPrice?:    number;
  commissionRate:   number;
  commissionAmount?: number;

  // Admin
  adminNote?:       string;
  adminLog?: Array<{
    event?:       string;
    proName?:     string;
    type?:        string;
    scheduledAt?: Date;
    confirmedAt?: Date;
    completedAt?: Date;
    meetingLink?: string;
    createdAt?:   Date;
  }>;

  confirmedAt?: Date;
  cancelledAt?: Date;
  completedAt?: Date;
  createdAt?:   Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    user:             { type: Schema.Types.ObjectId, ref: "User",         required: true },
    professional:     { type: Schema.Types.ObjectId, ref: "Professional", required: true },
    consultationType: { type: String, enum: ["in_person", "online"], default: "in_person" },

    scheduledAt:   { type: Date,   default: null },
    slotId:        { type: String, default: null },
    durationMin:   { type: Number, default: 60 },
    preferredDate: { type: String, default: null },

    meetingLink:     { type: String, default: null },
    meetingProvider: { type: String, enum: ["jitsi", "whereby", "zoom", "meet", null], default: null },
    meetingRoomId:   { type: String, default: null },

    // Le message est stocké chiffré dans "_encryptedMessage" par le backend principal.
    // L'admin le lit via le virtual "message" exposé par le populate.
    isAnonymous: { type: Boolean, default: true },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
      default: "pending",
    },

    sessionPrice:     { type: Number },
    commissionRate:   { type: Number, default: 0.1 },
    commissionAmount: { type: Number },

    adminNote: { type: String },
    adminLog: [{
      event:       { type: String },
      proName:     { type: String },
      type:        { type: String },
      scheduledAt: { type: Date },
      confirmedAt: { type: Date },
      completedAt: { type: Date },
      meetingLink: { type: String },
      createdAt:   { type: Date, default: Date.now },
    }],

    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
    completedAt: { type: Date },
  },
  { collection: "bookings", timestamps: true }
);

export const Booking = mongoose.models.Booking
  ? (mongoose.model("Booking") as mongoose.Model<IBooking>)
  : mongoose.model<IBooking>("Booking", BookingSchema);

// ─── Post ────────────────────────────────────────────────────
export interface IPost extends Document {
  author?:           mongoose.Types.ObjectId;
  content?:          string;
  postType?:         string;
  isAnonymous?:      boolean;
  isVisible:         boolean;
  deletedAt?:        Date | null;
  reportCount:       number;
  reports?: Array<{
    user?:       mongoose.Types.ObjectId;
    reason?:     string;
    details?:    string;
    status:      "pending" | "reviewed" | "dismissed";
    reportedAt?: Date;
  }>;
  likesCount?:        number;
  sameFeelingsCount?: number;
  commentsCount?:     number;
  createdAt?:         Date;
}

const PostSchema = new Schema<IPost>(
  {
    author:      { type: Schema.Types.ObjectId, ref: "User" },
    content:     { type: String },
    postType:    { type: String },
    isAnonymous: { type: Boolean },
    isVisible:   { type: Boolean, default: true },
    deletedAt:   { type: Date, default: null },
    reportCount: { type: Number, default: 0 },
    reports: [
      {
        user:       { type: Schema.Types.ObjectId, ref: "User" },
        reason:     { type: String },
        details:    { type: String },
        status:     { type: String, enum: ["pending", "reviewed", "dismissed"], default: "pending" },
        reportedAt: { type: Date },
      },
    ],
    likesCount:        { type: Number, default: 0 },
    sameFeelingsCount: { type: Number, default: 0 },
    commentsCount:     { type: Number, default: 0 },
  },
  { collection: "posts", timestamps: true }
);

export const Post = mongoose.models.Post
  ? (mongoose.model("Post") as mongoose.Model<IPost>)
  : mongoose.model<IPost>("Post", PostSchema);

// ─── Challenge ───────────────────────────────────────────────
export interface IChallenge extends Document {
  title: string;
  description: string;
  instructions?: string[];
  category: string;
  difficulty: string;
  durationMinutes: number;
  points: number;
  icon: string;
  completionType?: any;
  isPremium: boolean;
  isActive: boolean;
  targetLevel?: string;
  order?: number;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    title:           { type: String, required: true },
    description:     { type: String, required: true },
    instructions:    [{ type: String }],
    category:        { type: String, required: true },
    difficulty:      { type: String, default: "easy" },
    durationMinutes: { type: Number, required: true },
    points:          { type: Number, required: true },
    icon:            { type: String, required: true },
    completionType:  { type: Schema.Types.Mixed },
    isPremium:       { type: Boolean, default: false },
    isActive:        { type: Boolean, default: true },
    targetLevel:     { type: String },
    order:           { type: Number, default: 0 },
  },
  { collection: "challenges", timestamps: true }
);

export const Challenge = mongoose.models.Challenge
  ? (mongoose.model("Challenge") as mongoose.Model<IChallenge>)
  : mongoose.model<IChallenge>("Challenge", ChallengeSchema);

// ─── Ad ──────────────────────────────────────────────────────
export interface IAd extends Document {
  title: string;
  description?: string;
  imageUrl?: string;
  emoji?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  category: string;
  placement: string[];
  advertiser?: string;
  impressions: number;
  clicks: number;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;
  targetAgeMin?: number;
  targetAgeMax?: number;
  targetCity?: string;
}

const AdSchema = new Schema<IAd>(
  {
    title:        { type: String, required: true, maxlength: 60 },
    description:  { type: String, maxlength: 120 },
    imageUrl:     { type: String },
    emoji:        { type: String, default: "🌿" },
    ctaLabel:     { type: String, default: "En savoir plus", maxlength: 30 },
    ctaUrl:       { type: String },
    category:     { type: String, enum: ["prevention", "wellness", "local_product", "event", "service"], default: "wellness" },
    placement:    [{ type: String, enum: ["community_feed", "mood_screen", "challenges_screen"] }],
    advertiser:   { type: String },
    impressions:  { type: Number, default: 0 },
    clicks:       { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true },
    startsAt:     { type: Date },
    endsAt:       { type: Date },
    targetAgeMin: { type: Number },
    targetAgeMax: { type: Number },
    targetCity:   { type: String },
  },
  { collection: "ads", timestamps: true }
);

export const Ad = mongoose.models.Ad
  ? (mongoose.model("Ad") as mongoose.Model<IAd>)
  : mongoose.model<IAd>(   "Ad", AdSchema);

// ─── AppConfig ───────────────────────────────────────────────
export interface IAppConfig extends Document {
  key: string;
  value: any;
  description?: string;
  isPublic?: boolean;
}

const AppConfigSchema = new Schema<IAppConfig>(
  {
    key:         { type: String, required: true, unique: true },
    value:       { type: Schema.Types.Mixed, required: true },
    description: { type: String },
    isPublic:    { type: Boolean, default: false },
  },
  { collection: "appconfigs", timestamps: true }
);

export const AppConfig = mongoose.models.AppConfig
  ? (mongoose.model("AppConfig") as mongoose.Model<IAppConfig>)
  : mongoose.model<IAppConfig>("AppConfig", AppConfigSchema);