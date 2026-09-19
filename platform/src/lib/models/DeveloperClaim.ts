import { Schema, model, models } from "mongoose";

const DeveloperClaimSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    claimType: { type: String, enum: ["game", "developer"], required: true },
    gameSlug: { type: String, default: null, index: true },
    developerSlug: { type: String, default: null, index: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    verificationUrl: { type: String, required: true, trim: true },
    message: { type: String, default: "", maxlength: 2000 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNotes: { type: String, default: null, maxlength: 2000 },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const DeveloperClaim = models.DeveloperClaim || model("DeveloperClaim", DeveloperClaimSchema);
export default DeveloperClaim;
