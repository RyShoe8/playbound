import { Schema, model, models } from "mongoose";

/**
 * A flight device's measured layout, shared with every launcher once an admin
 * approves it (see src/lib/flightDeviceProfile.ts for the shape).
 *
 * One row per device. Players' calibrations land as the pending `profile`
 * (the latest one wins until approval) and count toward `submissions`, so an
 * admin can see how many owners agreed. Only `status: "approved"` is served.
 */
const FlightDeviceProfileSchema = new Schema(
  {
    vidPid: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: "Flight device" },
    profile: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    submissions: { type: Number, default: 0 },
    lastSubmittedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const FlightDeviceProfile = models.FlightDeviceProfile || model("FlightDeviceProfile", FlightDeviceProfileSchema);
export default FlightDeviceProfile;
