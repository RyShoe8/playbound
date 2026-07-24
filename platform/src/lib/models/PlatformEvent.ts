import { Schema, model, models } from "mongoose";

const PlatformEventSchema = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 2000 },
  gameSlug: { type: String, default: null },
  startsAt: { type: Date, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

const PlatformEvent = models.PlatformEvent || model("PlatformEvent", PlatformEventSchema);
export default PlatformEvent;
