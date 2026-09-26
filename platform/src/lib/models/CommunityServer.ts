import { Schema, model, models } from "mongoose";

const CommunityServerSchema = new Schema({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  gameSlug: { type: String, required: true, index: true },
  editionSlug: { type: String, default: null },
  mod: { type: String, default: null },
  regionKey: { type: String, required: true },
  profileKey: { type: String, required: true },
  settings: { type: Schema.Types.Mixed, default: {} },
  desiredState: { type: String, enum: ["running", "stopped"], default: "stopped" },
  manualPause: { type: Boolean, default: false },
  runtimeState: { type: String, enum: ["stopped", "pending", "running", "failed", "unknown"], default: "stopped" },
  health: { type: String, enum: ["unknown", "healthy", "unhealthy"], default: "unknown" },
  runtimeId: { type: String, default: null },
  host: { type: String, default: null },
  port: { type: Number, default: null },
  playerCount: { type: Number, default: null, min: 0 },
  maxPlayerCount: { type: Number, default: null, min: 0 },
  bots: { type: Number, default: null, min: 0 },
  playerCountCheckedAt: { type: Date, default: null },
  lastOccupiedAt: { type: Date, default: null },
  onlineSince: { type: Date, default: null },
  cooldownUntil: { type: Date, default: null },
  linkedEventId: { type: Schema.Types.ObjectId, ref: "PlatformEvent", default: null },
  protectedUntil: { type: Date, default: null },
  decisionReason: { type: String, default: null },
  operationKey: { type: String, default: null },
  recoveryAttempts: { type: Number, default: 0, min: 0 },
  nextRecoveryAt: { type: Date, default: null },
  lastReconciledAt: { type: Date, default: null },
  /*
   * PlayBound Dedicated. `ownerType: "user"` rows are a customer's saved
   * servers: kept out of automatic Community rotation, idle scale-down and
   * budget downsizing, and recovered when they crash (desiredState running).
   * `slug` stays the permanent public identity; `name` is the editable
   * display name.
   */
  ownerType: { type: String, enum: ["community", "user"], default: "community", index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  dedicatedSubscriptionId: { type: Schema.Types.ObjectId, ref: "DedicatedSubscription", default: null, index: true },
  /** Slots this server uses while online; the entitlement counts it only while allocated. */
  allocatedSlots: { type: Number, default: 0, min: 0 },
  /** True while `allocatedSlots` is charged against the subscription. */
  slotsHeld: { type: Boolean, default: false },
  visibility: { type: String, enum: ["public", "unlisted", "private"], default: "public" },
  description: { type: String, default: "" },
  /**
   * Bans PlayBound keeps for this server. Game servers forget their ban lists
   * when they restart, so these are re-applied to every new room (see
   * `liveStateRoomId`). The address is never sent to the browser.
   */
  bans: {
    type: [
      new Schema(
        {
          name: { type: String, required: true },
          address: { type: String, required: true },
          bannedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
          at: { type: Date, default: Date.now },
        },
        { _id: true }
      ),
    ],
    default: [],
  },
  /** Map rotation, in play order, from the game's declared map list. */
  mapRotation: { type: [String], default: [] },
  /** The map the server was on at its last reconcile (games with a live console only). */
  currentMap: { type: String, default: null },
  /** The room that bans and rotation were last applied to; a new room gets them again. */
  liveStateRoomId: { type: String, default: null },
  /** People the owner has given a role on this server (see dedicatedHosting/access.ts). */
  access: {
    type: [
      new Schema(
        {
          userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          role: { type: String, enum: ["administrator", "moderator"], required: true },
          grantedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
          grantedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
}, { timestamps: true });

CommunityServerSchema.index({ gameSlug: 1, editionSlug: 1, regionKey: 1 });
CommunityServerSchema.index({ desiredState: 1, runtimeState: 1 });
CommunityServerSchema.index({ "access.userId": 1 });

export default models.CommunityServer || model("CommunityServer", CommunityServerSchema);
