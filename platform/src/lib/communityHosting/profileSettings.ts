import { z } from "zod";

export const profileSettingsSchema = z.object({
  verification: z.enum(["testing", "verified", "blocked"]),
  blockedReason: z.string().max(500).nullable(),
  queryKind: z.enum(["none", "openra-master"]),
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

export function validateProfileReadiness(settings: ProfileSettings, measured: {
  sampleCount: number; cpuCores: number; ramBytes: number; measuredThroughPlayers: number;
}): string | null {
  if (settings.queryVerified && settings.queryKind === "none") return "A verified player query needs a query adapter";
  if (settings.verification !== "verified" && (settings.enabled || settings.rotationEligible)) return "Only fully verified profiles can run automatically";
  if (settings.rotationEligible && !settings.enabled) return "Enable the profile before marking it rotation eligible";
  if (settings.verification === "verified") {
    if (!settings.queryVerified || !settings.joinVerified) return "A verified profile needs successful player-query and client Join tests";
    if (settings.queryKind === "none") return "A verified profile needs a player-query adapter";
    if (measured.sampleCount < 2 || measured.measuredThroughPlayers < 1 || measured.cpuCores <= 0 || measured.ramBytes <= 0) {
      return "A verified profile needs idle and occupied CPU/RAM measurements with at least one player";
    }
  }
  return null;
}
