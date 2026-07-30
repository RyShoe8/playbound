import { Schema, model, models } from "mongoose";

/** Sliding/fixed window counters for discussion rate limits. */
const RateLimitBucketSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    windowStart: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitBucket =
  models.RateLimitBucket || model("RateLimitBucket", RateLimitBucketSchema);
export default RateLimitBucket;
