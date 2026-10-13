import { Schema, model, models } from "mongoose";
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  timezone: { type: String, required: true },
  publishLooking: { type: Boolean, default: false, index: true },
  window: { type: { startsAt: Date, endsAt: Date }, default: null },
  weekly: { type: [{ _id: false, day: Number, startMinute: Number, endMinute: Number }], default: [] },
}, { timestamps: true });
export default models.PlayAvailability || model("PlayAvailability", schema);
