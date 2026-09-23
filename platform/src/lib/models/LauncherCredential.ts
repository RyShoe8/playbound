import { Schema, model, models } from "mongoose";

/** One independently revocable bearer for one launcher sign-in. Store only its hash. */
const LauncherCredentialSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    createdAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: false }
);

LauncherCredentialSchema.index({ userId: 1, createdAt: -1 });

const LauncherCredential = models.LauncherCredential || model("LauncherCredential", LauncherCredentialSchema);
export default LauncherCredential;
