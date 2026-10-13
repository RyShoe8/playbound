import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import ServerResourceSample from "@/lib/models/ServerResourceSample";
import { isSettledResourceReading, MIN_SETTLED_SAMPLES, RESOURCE_MEASUREMENT_VERSION } from "./resourceMeasurement";

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
  sampleIntervalMs?: number;
  processCount?: number;
  scope?: string;
  nodeCpuCores?: number;
  runtimeAgeMs?: number;
};

/** Measurements can raise a future placement envelope. Lowering needs admin review. */
export async function recordResourceSample(sample: MeasuredSample) {
  if (!Number.isFinite(sample.cpuCores) || sample.cpuCores < 0 || !Number.isFinite(sample.ramBytes) || sample.ramBytes <= 0) return false;
  if (sample.players !== null && (!Number.isInteger(sample.players) || sample.players < 0)) return false;
  if (!Number.isFinite(sample.observedAt.getTime())) return false;
  const profile = await CommunityServerProfile.findOne({ key: sample.profileKey }).select({ baselineVersion: 1, measurementResetAt: 1, sampleCount: 1, lastSampleAt: 1 }).lean();
  if (!profile) return false;
  if (profile.measurementResetAt && sample.observedAt < new Date(profile.measurementResetAt)) return false;
  const baselineVersion = profile.baselineVersion || 1;
  const settled = isSettledResourceReading(sample);
  // Short spawn tests remain startup audit evidence, never a permanent idle peak.
  if (!settled && sample.phase !== "startup") return false;
  if (sample.nodeCpuCores != null && sample.cpuCores > sample.nodeCpuCores) return false;
  const day = sample.observedAt.toISOString().slice(0, 10);
  if (settled && profile.sampleCount >= MIN_SETTLED_SAMPLES && profile.lastSampleAt
    && new Date(profile.lastSampleAt).toISOString().slice(0, 10) >= day) return false;
  const bucket = !settled ? `startup:${day}` : profile.sampleCount >= MIN_SETTLED_SAMPLES
    ? `daily:${day}` : `calibration:${Math.floor(sample.observedAt.getTime() / 10_000)}`;
  const sampleKey = `${sample.profileKey}:${baselineVersion}:${bucket}`;
  const inserted = await ServerResourceSample.updateOne({ sampleKey }, { $setOnInsert: {
    ...sample, sampleKey, baselineVersion, measurementVersion: RESOURCE_MEASUREMENT_VERSION,
  } }, { upsert: true });
  if (!inserted.upsertedCount) return false;
  if (!settled) return true;
  const filter = { key: sample.profileKey, baselineVersion };
  await CommunityServerProfile.updateOne(filter, {
    $inc: { sampleCount: 1 },
    $set: { lastSampleAt: sample.observedAt },
    $max: {
      "candidateEnvelope.cpuCores": Math.min(sample.nodeCpuCores!, Math.max(0.25, Math.ceil(sample.cpuCores * 1.5 * 100) / 100)),
      "candidateEnvelope.ramBytes": Math.ceil(sample.ramBytes * 1.3),
      "candidateEnvelope.measuredThroughPlayers": sample.players ?? 0,
    },
  });
  const current = await CommunityServerProfile.findOne(filter).select({ sampleCount: 1, candidateEnvelope: 1 }).lean();
  if (current?.sampleCount >= MIN_SETTLED_SAMPLES) {
    await CommunityServerProfile.updateOne(filter, { $max: {
      "envelope.cpuCores": current.candidateEnvelope.cpuCores,
      "envelope.ramBytes": current.candidateEnvelope.ramBytes,
      "envelope.measuredThroughPlayers": current.candidateEnvelope.measuredThroughPlayers,
    } });
  }
  return true;
}
