import { z } from "zod";
import { isIP } from "node:net";

function isPrivateLanIp(value: string) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** POST /api/devices — a launcher registering/updating itself. */
export const registerDeviceSchema = z.object({
  deviceId: z.string().trim().min(10).max(80),
  name: z.string().trim().min(1).max(120),
  lanAddresses: z.array(z.string().refine(isPrivateLanIp, "A LAN address must be a private IPv4 address")).max(8).optional(),
  hostPort: z.number().int().min(1).max(65535).nullable().optional(),
  capabilities: z
    .object({
      remotePlayHost: z.boolean().optional(),
      remotePlayClient: z.boolean().optional(),
      hardwareEncode: z.boolean().optional(),
      hardwareDecode: z.boolean().optional(),
    })
    .optional(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
