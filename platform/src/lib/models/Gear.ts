import { Schema, model, models } from "mongoose";
import { GEAR_CATEGORIES } from "@/lib/amazonGear";

const AffiliateLinkSchema = new Schema(
  {
    retailer: { type: String, required: true },
    url: { type: String, required: true },
    price: { type: String, default: null },
    shipping: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const GearSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: [...GEAR_CATEGORIES],
      index: true,
    },
    description: { type: String, default: "" },
    manufacturer: { type: String, default: null },
    playboundCertified: { type: Boolean, default: false },
    coverImage: { type: String, default: null },
    screenshots: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    platforms: { type: [String], default: [] },
    bestFor: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    affiliateLinks: { type: [AffiliateLinkSchema], default: [] },
  },
  { timestamps: true }
);

const Gear = models.Gear || model("Gear", GearSchema);

export default Gear;
