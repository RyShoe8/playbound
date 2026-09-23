import { Schema, model, models } from "mongoose";

/**
 * A registered PlayBound PC, for PlayBound Remote — "Ryan's Gaming PC" as a
 * real, trusted entity distinct from "the laptop", both belonging to one
 * account. `deviceId` is the same locally-persisted id the launcher already
 * generates for itself (`launcher/main.js`'s `getRemoteDeviceId()`),
 * promoted here from a value the launcher merely holds to one the account
 * actually recognizes.
 *
 * Pairing mirrors `CouchSession.controllers[].status` exactly — see
 * `platform/src/lib/models/CouchSession.ts` — request → host approves →
 * trusted from then on, enforced the same way
 * `launcher/services/couch/inputAuth.js` enforces couch's approved
 * controllers. `trustedDevices` lives on the *host* device's own document:
 * each entry is one other device this one has approved as a Remote Play
 * client.
 */

const TrustedDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true },
    name: { type: String, required: true },
    trustedAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: { type: Date, default: null },
  },
  { _id: false }
);

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
    trustedDevices: { type: [TrustedDeviceSchema], default: [] },
  },
  { timestamps: true }
);

DeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const Device = models.Device || model("Device", DeviceSchema);
export default Device;
