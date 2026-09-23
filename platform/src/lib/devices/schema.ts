import { z } from "zod";

/** POST /api/devices — a launcher registering/updating itself. */
export const registerDeviceSchema = z.object({
  deviceId: z.string().trim().min(10).max(80),
  name: z.string().trim().min(1).max(120),
  capabilities: z
    .object({
      remotePlayHost: z.boolean().optional(),
      remotePlayClient: z.boolean().optional(),
      hardwareEncode: z.boolean().optional(),
      hardwareDecode: z.boolean().optional(),
    })
    .optional(),
});

/** POST /api/devices/[deviceId]/trust — a host trusting a paired client. */
export const trustDeviceSchema = z.object({
  deviceId: z.string().trim().min(10).max(80),
  name: z.string().trim().min(1).max(120),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type TrustDeviceInput = z.infer<typeof trustDeviceSchema>;
