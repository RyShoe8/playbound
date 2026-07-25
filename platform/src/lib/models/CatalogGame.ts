import { Schema, model, models } from "mongoose";

const GameArtSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { _id: false }
);

const SystemRequirementsSchema = new Schema(
  {
    min: { type: String, required: true },
    recommended: { type: String, required: true },
  },
  { _id: false }
);

const CatalogGameSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    developerSlug: { type: String, required: true },
    developerName: { type: String, default: null },
    genres: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    license: { type: String, required: true },
    releaseYear: { type: Number, required: true },
    sizeMB: { type: Number, required: true },
    platforms: { type: [String], default: [] },
    features: { type: [String], default: [] },
    launchMethods: { type: [String], default: [] },
    browserPlayable: { type: Boolean, default: false },
    steamDeck: { type: Boolean, default: false },
    website: { type: String, required: true },
    githubRepo: { type: String, default: null },
    gameOfWeek: { type: Boolean, default: false },
    hiddenGem: { type: Boolean, default: false },
    art: { type: GameArtSchema, required: true },
    coverImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    systemRequirements: { type: SystemRequirementsSchema, required: true },
    published: { type: Boolean, default: true, index: true },
    submissionId: { type: Schema.Types.ObjectId, ref: "GameSubmission", default: null },
  },
  { timestamps: true }
);

const CatalogGame = models.CatalogGame || model("CatalogGame", CatalogGameSchema);
export default CatalogGame;
