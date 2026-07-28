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

const LauncherInstallSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    kind: {
      type: String,
      enum: [
        "github-zip",
        "github-installer",
        "github-jar",
        "direct-zip",
        "direct-installer",
        "direct-exe",
        "openttd-zip",
        "external",
      ],
      required: true,
    },
    repo: { type: String, default: null },
    assetPattern: { type: String, default: null },
    exeHint: { type: String, default: null },
    url: { type: String, default: null },
    fileName: { type: String, default: null },
    versionLabel: { type: String, default: null },
    knownExePaths: { type: [String], default: [] },
    installRoot: { type: String, default: null },
    connectArgs: { type: [String], default: [] },
    note: { type: String, default: null },
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
    steamAppId: { type: String, default: null },
    githubRepo: { type: String, default: null },
    gameOfWeek: { type: Boolean, default: false },
    hiddenGem: { type: Boolean, default: false },
    art: { type: GameArtSchema, required: true },
    coverImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    systemRequirements: { type: SystemRequirementsSchema, required: true },
    launcherInstall: { type: LauncherInstallSchema, default: null },
    published: { type: Boolean, default: true, index: true },
    submissionId: { type: Schema.Types.ObjectId, ref: "GameSubmission", default: null },
    managedBy: { type: String, enum: ["admin", "developer"], default: "admin" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const CatalogGame = models.CatalogGame || model("CatalogGame", CatalogGameSchema);
export default CatalogGame;
