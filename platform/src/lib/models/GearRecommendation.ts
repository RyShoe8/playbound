import { Schema, model, models } from "mongoose";

const GearRecommendationSchema = new Schema(
  {
    gameSlug: { type: String, required: true, index: true },
    gearSlug: { type: String, required: true, index: true },
    rank: { type: String, default: null }, // e.g., 🥇, 🥈, 🥉
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// Compound index to ensure a piece of gear is only recommended once per game
GearRecommendationSchema.index({ gameSlug: 1, gearSlug: 1 }, { unique: true });

const GearRecommendation = models.GearRecommendation || model("GearRecommendation", GearRecommendationSchema);

export default GearRecommendation;