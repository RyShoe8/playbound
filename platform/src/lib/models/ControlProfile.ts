import { Schema, model, models } from "mongoose";

/**
 * A PlayBound Controls "Game Control Profile" — the real product behind the
 * feature. Distinct from `CatalogGame.controls` (the human-readable
 * reference bindings shown on `/games/[slug]/controls`): that block is
 * documentation, gated by `sourceUrl`/`verified` at the zod layer, and was
 * never meant to be executable. This model is the machine-readable recipe
 * the launcher's Input Engine actually runs — physical pad input in,
 * synthetic keyboard/mouse output out.
 *
 * Games are identified by slug across this codebase (see Edition.ts's own
 * note on the same tradeoff) — `gameSlug` is what the launcher and admin
 * queries actually filter on, `gameId` is kept for population where useful.
 * `editionSlug` is optional: most profiles apply to the base game, but a
 * profile can be scoped to one edition when its engine/build differs enough
 * to need its own bindings.
 *
 * Only a `status: "verified"` profile is ever activated automatically for a
 * real player — see `applyControllerConfig` in launcher/main.js. Anything
 * else is admin-preview-only, so there is always exactly one
 * "PlayBound Verified" recipe a new player can land on, never a wall of
 * drafts (per the original feature brief).
 */

const ControlProfileActionSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    /** What this action actually does when triggered — the second hop of the Game Actions abstraction (physical input → action → output). */
    output: {
      type: new Schema(
        {
          type: { type: String, enum: ["key", "mouseButton"], required: true },
          /** Required when type is "key" — a name from launcher/services/inputEngine/vkCodes.js (e.g. "W", "Space"). */
          vk: { type: String, default: null },
          /** Required when type is "mouseButton". */
          button: { type: String, enum: ["left", "right", "middle"], default: null },
        },
        { _id: false }
      ),
      required: true,
    },
  },
  { _id: false }
);

const ControlProfileBindingSchema = new Schema(
  {
    actionId: { type: String, required: true },
    /** A pad button or direction/trigger input supported by actionMap.js (e.g. "A", "LEFT_UP", "RT"). */
    physicalInput: { type: String, required: true },
  },
  { _id: false }
);

const ControlProfileContextSchema = new Schema(
  {
    name: { type: String, required: true },
    /** BUTTON name that must be held for this context's bindings to be active, e.g. "LB". */
    trigger: { type: String, required: true },
    bindings: { type: [ControlProfileBindingSchema], default: [] },
  },
  { _id: false }
);

const StickMouseSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    deadzone: { type: Number, default: 0.15 },
    curve: { type: String, enum: ["linear", "exponential"], default: "exponential" },
    sensitivity: { type: Number, default: 1.35 },
    acceleration: { type: Number, default: 0.35 },
    smoothing: { type: Number, default: 0.08 },
    maxVelocity: { type: Number, default: 900 },
    invertY: { type: Boolean, default: false },
    precisionMultiplier: { type: Number, default: 0.4 },
  },
  { _id: false }
);

const ControlProfileSchema = new Schema(
  {
    gameId: { type: Schema.Types.ObjectId, ref: "CatalogGame", default: null, index: true },
    gameSlug: { type: String, required: true, index: true },
    editionSlug: { type: String, default: null },

    name: { type: String, required: true },
    version: { type: String, required: true },
    platform: { type: String, enum: ["windows"], default: "windows" },
    /** Only strategy the Input Engine implements in V1 — see docs/plans for the deferred virtual-gamepad backend. */
    inputStrategy: { type: String, enum: ["keyboard_mouse"], default: "keyboard_mouse" },

    actions: { type: [ControlProfileActionSchema], default: [] },
    bindings: { type: [ControlProfileBindingSchema], default: [] },
    contexts: { type: [ControlProfileContextSchema], default: [] },
    stickMouseSettings: { type: StickMouseSettingsSchema, default: () => ({}) },

    testedControllers: { type: [String], default: [] },
    antiCheatCompatibility: {
      type: String,
      enum: ["verified", "unknown", "incompatible"],
      default: "unknown",
    },
    /** Only "verified" activates automatically for real players. */
    status: { type: String, enum: ["draft", "testing", "verified"], default: "draft", index: true },

    notes: { type: String, default: null },
  },
  { timestamps: true }
);

// One active profile per game+edition+status lookup is the launcher's actual
// query shape (find the verified one for this game/edition); this composite
// index serves it directly instead of a full collection scan per launch.
ControlProfileSchema.index({ gameSlug: 1, editionSlug: 1, status: 1 });
ControlProfileSchema.index(
  { gameSlug: 1, editionSlug: 1 },
  { unique: true, partialFilterExpression: { status: "verified" } }
);

export default models.ControlProfile || model("ControlProfile", ControlProfileSchema);
