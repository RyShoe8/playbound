import { Schema, model, models } from "mongoose";

/** One fleet-wide concurrent-player reading per 15-minute hosting interval. */
const schema = new Schema({
  regionKey: { type: String, required: true },
  bucketStart: { type: Date, required: true },
  observedAt: { type: Date, required: true },
  serverCount: { type: Number, required: true, min: 0 },
  players: { type: Number, default: null, min: 0 },
}, { timestamps: false });

schema.index({ regionKey: 1, bucketStart: 1 }, { unique: true });
schema.index({ regionKey: 1, observedAt: -1 });

export default models.CommunityPopulationSample || model("CommunityPopulationSample", schema);
