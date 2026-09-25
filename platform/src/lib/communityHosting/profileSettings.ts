import { z } from "zod";

export const profileSettingsSchema = z.object({
  verification: z.enum(["testing", "verified", "blocked"]),
  blockedReason: z.string().max(500).nullable(),
  queryKind: z.enum(["none", "openra-master", "a2s-local", "hurry-curry-registry", "luanti-master", "hypersomnia-master"]),
  queryVerified: z.boolean(),
  joinVerified: z.boolean(),
  enabled: z.boolean(),
  rotationEligible: z.boolean(),
  weight: z.number().int().min(1).max(100),
  minimumOnlineMinutes: z.number().int().min(0).max(10080).nullable(),
  idleMinutes: z.number().int().min(15).max(10080).nullable(),
  cooldownMinutes: z.number().int().min(0).max(10080).nullable(),
}).strict();

export type ProfileSettings = z.infer<typeof profileSettingsSchema>;

/** Selection is the only gate now; kept for the route's call shape. */
export function validateProfileReadiness(_settings: ProfileSettings, _measured: {
  sampleCount: number; cpuCores: number; ramBytes: number; measuredThroughPlayers: number;
}): string | null {
  return null;
}
