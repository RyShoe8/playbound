import { Schema, model, models } from "mongoose";

/**
 * PlayBound Dedicated — a hosting tier's product configuration (Basic first).
 *
 * A separate product from the PlayBound subscription: customers buy a pool of
 * concurrent player slots in one region and split it across any number of
 * running servers. Everything a product decision might change lives here so
 * admin can edit it without a deploy.
 *
 * `resourceClass` is the internal sizing the customer never sees: one unit is
 * `slotsPerUnit` player slots and reserves the CPU/RAM/storage below. Pro and
 * Extreme will be further tiers with their own class, not new scheduler code.
 */
const SlotPackageSchema = new Schema(
  {
    slots: { type: Number, required: true, min: 1 },
    priceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "usd" },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Filled by the billing phase; a price change creates a new Stripe Price.
    stripePriceId: { type: String, default: null },
  },
  { _id: false }
);

const RegionSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    salesEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

/** A server profile's eligibility for this tier. Keyed by CommunityServerProfile.key. */
const TierGameSchema = new Schema(
  {
    profileKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    newServerCreationEnabled: { type: Boolean, default: true },
    existingServerStartEnabled: { type: Boolean, default: true },
    minSlots: { type: Number, default: 4, min: 1 },
    maxSlots: { type: Number, default: 32, min: 1 },
    slotIncrement: { type: Number, default: 4, min: 1 },
    supportedRegions: { type: [String], default: [] },
    allowedMods: { type: [String], default: [] },
    readinessStatus: { type: String, enum: ["draft", "testing", "verified"], default: "draft" },
    adminNote: { type: String, default: null },
  },
  { _id: false }
);

const DedicatedHostingTierSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // "basic"
    name: { type: String, default: "PlayBound Dedicated Basic" },
    description: { type: String, default: "" },
    salesEnabled: { type: Boolean, default: false },
    // Emergency switch: no customer server of this tier may start.
    startsDisabled: { type: Boolean, default: false },
    resourceClass: {
      key: { type: String, default: "class_1" },
      slotsPerUnit: { type: Number, default: 4, min: 1 },
      memoryMbPerUnit: { type: Number, default: 1024, min: 0 },
      cpuPerUnit: { type: Number, default: 0.5, min: 0 },
      storageGbPerUnit: { type: Number, default: 5, min: 0 },
    },
    minAllocation: { type: Number, default: 4, min: 1 },
    allocationIncrement: { type: Number, default: 4, min: 1 },
    maxSlotsSold: { type: Number, default: 32, min: 1 },
    maxSavedServers: { type: Number, default: 10, min: 1 },
    backupRetention: { type: Number, default: 3, min: 0 },
    paymentGraceHours: { type: Number, default: 72, min: 0 },
    cancellationRetentionDays: { type: Number, default: 14, min: 0 },
    safetyReservePercent: { type: Number, default: 15, min: 0, max: 90 },
    regions: { type: [RegionSchema], default: [] },
    packages: { type: [SlotPackageSchema], default: [] },
    games: { type: [TierGameSchema], default: [] },
    stripeProductId: { type: String, default: null },
  },
  { timestamps: true }
);

export default models.DedicatedHostingTier || model("DedicatedHostingTier", DedicatedHostingTierSchema);
