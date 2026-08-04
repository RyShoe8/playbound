import { Schema, model, models } from "mongoose";

/**
 * A studio, team, or project that makes catalog games ("OpenRA Team").
 *
 * Previously these lived only in src/lib/data/developers.ts, which meant the
 * Developer dropdown in the game and mod editors could only ever offer the
 * nineteen hardcoded entries — adding one required a code change and a deploy.
 *
 * Games and mods reference a developer by `slug`, so renaming one cascades to
 * every referencing document (see the admin PATCH route) and deleting one is
 * blocked while anything still points at it.
 */
const DeveloperSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    tagline: { type: String, default: "" },
    about: { type: String, default: "" },
    /** Year the team formed. 0 when unknown — the profile hides it. */
    founded: { type: Number, default: 0 },
    location: { type: String, default: "" },
    website: { type: String, default: "" },
    /** OKLCH hue (0–360) driving the profile's generated artwork. */
    artHue: { type: Number, default: 210 },
    published: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const Developer = models.Developer || model("Developer", DeveloperSchema);
export default Developer;
