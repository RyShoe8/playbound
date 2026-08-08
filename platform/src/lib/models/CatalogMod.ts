import { Schema, model, models } from "mongoose";

const GameArtSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { _id: false }
);

const InstallStepSchema = new Schema(
  {
    platform: { type: String, enum: ["all", "windows", "macos", "linux"], default: "all" },
    text: { type: String, required: true },
    command: { type: String, default: null },
  },
  { _id: false }
);

const FaqSchema = new Schema(
  {
    q: { type: String, required: true },
    a: { type: String, required: true },
  },
  { _id: false }
);

const CatalogModSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    baseGameSlug: { type: String, required: true, index: true },
    /** When set, mod is scoped to one edition; null = base-game-wide. */
    editionSlug: { type: String, default: null, index: true },
    developerSlug: { type: String, required: true },
    developerName: { type: String, default: null },
    license: { type: String, required: true },
    releaseYear: { type: Number, required: true },
    sizeMB: { type: Number, required: true, default: 0 },
    website: { type: String, required: true },
    githubRepo: { type: String, default: null },
    downloadKind: {
      type: String,
      enum: ["github-zip", "direct-zip", "external"],
      required: true,
      default: "github-zip",
    },
    assetPattern: { type: String, default: null },
    directUrl: { type: String, default: null },
    /** Path under the base game install dir (e.g. "mods"). Empty = game root. */
    installRelativePath: { type: String, default: "mods" },
    art: { type: GameArtSchema, required: true },
    coverImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    published: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["draft", "testing", "published"],
      default: "published",
      index: true,
    },
    managedBy: { type: String, enum: ["admin", "developer"], default: "admin" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    detectedVersion: { type: String, default: null },
    lastVersionCheckAt: { type: Date, default: null },
    versionCheckStatus: {
      type: String,
      enum: ["ok", "stale", "broken", "skipped", "updated"],
      default: null,
    },
    versionCheckNote: { type: String, default: null },
    autoUpdatePinned: { type: Boolean, default: true },

    // Editorial depth — see src/lib/enrich.ts.
    longDescription: { type: String, default: null },
    whatItChanges: { type: String, default: null },
    compatibility: { type: String, default: null },
    installSteps: { type: [InstallStepSchema], default: [] },
    faq: { type: [FaqSchema], default: [] },
  },
  { timestamps: true }
);

const CatalogMod = models.CatalogMod || model("CatalogMod", CatalogModSchema);
export default CatalogMod;
