import { Schema, model, models } from "mongoose";

const WeeklyScheduleDispatchSchema = new Schema({
  key: { type: String, required: true, unique: true },
  completedAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  sent: { type: Number, default: 0 },
}, { timestamps: true });

export default models.WeeklyScheduleDispatch || model("WeeklyScheduleDispatch", WeeklyScheduleDispatchSchema);
