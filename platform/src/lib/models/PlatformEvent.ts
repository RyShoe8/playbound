import { Schema, model, models } from "mongoose";

const PlatformEventSchema = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 2000 },
  gameSlug: { type: String, default: null },
  startsAt: { type: Date, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

// The events page and the admin counter both filter on startsAt >= now and
// sort by it; this index serves the range scan and the sort together.
PlatformEventSchema.index({ startsAt: 1 });

const PlatformEvent = models.PlatformEvent || model("PlatformEvent", PlatformEventSchema);
export default PlatformEvent;
