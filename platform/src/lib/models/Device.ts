import { Schema, model, models } from "mongoose";

/**
 * A registered PlayBound PC, for PlayBound Remote Play — "Ryan's Gaming PC"
 * as a real entity distinct from "the laptop", both belonging to one
 * account. `deviceId` is the same locally-persisted id the launcher already
 * generates for itself (`launcher/main.js`'s `getRemoteDeviceId()`),
 * promoted here from a value the launcher merely holds to one the account
 * actually recognizes.
 *
 * Authorization is the account boundary itself (every query is scoped to
 * `userId`) — Remote Play only streams between devices on the same
 * PlayBound account, so there is no separate per-device trust/pairing step
 * here.
 */

const DeviceCapabilitiesSchema = new Schema(
  {
    remotePlayHost: { type: Boolean, default: false },
    remotePlayClient: { type: Boolean, default: false },
    hardwareEncode: { type: Boolean, default: false },
    hardwareDecode: { type: Boolean, default: false },
  },
  { _id: false }
);

const DeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String, required: true },
    /** User-editable — "Ryan's Gaming PC". Defaults to the OS hostname at first sync; see launcher's getRemoteDeviceName(). */
    name: { type: String, required: true },
    platform: { type: String, enum: ["windows"], default: "windows" },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    capabilities: { type: DeviceCapabilitiesSchema, default: () => ({}) },
    /** Current private LAN addresses, visible only to other devices on this account. */
    lanAddresses: { type: [String], default: [] },
    hostPort: { type: Number, default: null },
  },
  { timestamps: true }
);

DeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const Device = models.Device || model("Device", DeviceSchema);
export default Device;
