import { Schema, model, models } from "mongoose";

/**
 * Configuration for an external game store / provider.
 *
 * Seeded once, referenced by ingestion adapters and the UI for display names,
 * colors, and icons. Editable through admin for operational changes without
 * a redeploy.
 */
const StoreProviderSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      enum: ["epic", "steam", "gog", "prime_gaming"],
    },
    name: { type: String, required: true },
    /** Path to logo under /public or an absolute URL. */
    logoUrl: { type: String, default: null },
    /** Root store URL for link-building. */
    baseUrl: { type: String, required: true },
    /** HSL / oklch accent for UI store badges. */
    color: { type: String, default: null },
    /** Whether the cron job should ingest from this provider. */
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const StoreProvider = models.StoreProvider || model("StoreProvider", StoreProviderSchema);
export default StoreProvider;
