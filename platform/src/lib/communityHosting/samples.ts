import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import ServerResourceSample from "@/lib/models/ServerResourceSample";

export type MeasuredSample = {
  profileKey: string;
  communityServerId?: string | null;
  observedAt: Date;
  players: number | null;
  cpuCores: number;
  ramBytes: number;
  nodeCpuPercent?: number | null;
  nodeRamPercent?: number | null;
  phase: "startup" | "idle" | "occupied";
  source: "audit" | "live";
};

/** Measurements can raise a future placement envelope. Lowering needs admin review. */
export async function recordResourceSample(sample: MeasuredSample) {
  if (!Number.isFinite(sample.cpuCores) || sample.cpuCores < 0 || !Number.isFinite(sample.ramBytes) || sample.ramBytes <= 0) return false;
  if (sample.players !== null && (!Number.isInteger(sample.players) || sample.players < 0)) return false;
  const profile = await CommunityServerProfile.findOne({ key: sample.profileKey }).select({ _id: 1 }).lean();
  if (!profile) return false;
  await ServerResourceSample.create(sample);
  await CommunityServerProfile.updateOne({ key: sample.profileKey }, {
    $inc: { sampleCount: 1 },
    $set: { lastSampleAt: sample.observedAt },
    $max: {
      "envelope.cpuCores": Math.max(0.25, Math.ceil(sample.cpuCores * 1.5 * 100) / 100),
      "envelope.ramBytes": Math.ceil(sample.ramBytes * 1.3),
      "envelope.measuredThroughPlayers": sample.players ?? 0,
    },
  });
  return true;
}
