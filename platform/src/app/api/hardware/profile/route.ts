import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import UserHardwareProfile, { PRIMARY_DEVICE_ID } from "@/lib/models/UserHardwareProfile";
import HardwareGpu from "@/lib/models/HardwareGpu";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { hardwareProfilePayloadSchema } from "@/lib/hardware/schema";
import { normalizeAndLinkProfile } from "@/lib/hardware/upsertKnowledge";
import { normalizeCpuName, normalizeGpuName } from "@/lib/hardware/normalize";
import { inferGpuTierFromName } from "@/lib/hardware/tiers";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

async function publicProfile(doc: {
  deviceId?: string;
  deviceName?: string | null;
  collectedAt: Date;
  os: Record<string, unknown>;
  cpu: Record<string, unknown>;
  gpus: Array<Record<string, unknown>>;
  primaryGpuIndex: number | null;
  primaryGpuConfidence: string;
  memory: Record<string, unknown>;
  storage: Record<string, unknown>;
  detectionErrors?: string[];
  updatedAt?: Date;
}) {
  const gpuIds = (doc.gpus || [])
    .map((g) => g.hardwareGpuId)
    .filter(Boolean)
    .map(String);
  const tierById = new Map<string, string>();
  if (gpuIds.length) {
    const rows = await HardwareGpu.find({ _id: { $in: gpuIds } })
      .select("tier")
      .lean();
    for (const row of rows) {
      tierById.set(String(row._id), String(row.tier || "unknown"));
    }
  }

  return {
    deviceId: doc.deviceId || PRIMARY_DEVICE_ID,
    deviceName: doc.deviceName ?? null,
    collectedAt: doc.collectedAt?.toISOString?.() ?? doc.collectedAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? null,
    os: doc.os,
    cpu: {
      displayName: doc.cpu.displayName,
      manufacturer: doc.cpu.manufacturer,
      model: doc.cpu.model,
      cores: doc.cpu.cores,
      threads: doc.cpu.threads,
      tier: doc.cpu.tier,
    },
    gpus: (doc.gpus || []).map((g) => {
      const id = g.hardwareGpuId ? String(g.hardwareGpuId) : null;
      const fromDb = id ? tierById.get(id) : null;
      const inferred = inferGpuTierFromName(String(g.displayName || g.rawName || ""));
      return {
        displayName: g.displayName,
        manufacturer: g.manufacturer,
        model: g.model,
        vramMB: g.vramMB,
        isIntegrated: g.isIntegrated,
        isVirtual: g.isVirtual,
        tier: fromDb || inferred || "unknown",
      };
    }),
    primaryGpuIndex: doc.primaryGpuIndex,
    primaryGpuConfidence: doc.primaryGpuConfidence,
    memory: doc.memory,
    storage: doc.storage,
    detectionErrors: doc.detectionErrors || [],
  };
}

/** All three verbs default to PRIMARY_DEVICE_ID when the caller (older launcher, or the website) doesn't yet know about devices — same row every such caller has always used. */
function deviceIdFrom(url: URL): string {
  return url.searchParams.get("deviceId")?.trim() || PRIMARY_DEVICE_ID;
}

export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  const deviceId = deviceIdFrom(new URL(req.url));
  const doc = await UserHardwareProfile.findOne({ userId, deviceId }).lean();
  if (!doc) {
    return NextResponse.json({ profile: null });
  }
  return NextResponse.json({ profile: await publicProfile(doc as never) });
}

export async function PUT(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const payload = hardwareProfilePayloadSchema.parse(body);
    await dbConnect();

    const linked = await normalizeAndLinkProfile(payload);
    const cpuN = normalizeCpuName(payload.cpu.rawName);

    const gpus = payload.gpus.map((g, i) => {
      const n = normalizeGpuName(g.rawName);
      return {
        rawName: g.rawName,
        displayName: n.displayName,
        manufacturer: g.manufacturer || n.manufacturer,
        model: g.model || n.model,
        vramMB: g.vramMB ?? null,
        driverVersion: g.driverVersion ?? null,
        isIntegrated: g.isIntegrated ?? n.isIntegrated,
        isVirtual: g.isVirtual ?? n.isVirtual,
        hardwareGpuId: linked.gpuIds[i] || null,
      };
    });

    const deviceId = payload.deviceId || PRIMARY_DEVICE_ID;
    const existing = await UserHardwareProfile.findOne({ userId, deviceId });
    const isCreate = !existing;

    const doc = await UserHardwareProfile.findOneAndUpdate(
      { userId, deviceId },
      {
        $set: {
          deviceId,
          ...(payload.deviceName !== undefined ? { deviceName: payload.deviceName } : {}),
          schemaVersion: 1,
          collectedAt: new Date(payload.collectedAt),
          os: payload.os,
          cpu: {
            rawName: payload.cpu.rawName,
            displayName: linked.cpuDisplay,
            manufacturer: payload.cpu.manufacturer || cpuN.manufacturer,
            model: payload.cpu.model || cpuN.model,
            cores: payload.cpu.cores ?? null,
            threads: payload.cpu.threads ?? null,
            baseFrequencyGHz: payload.cpu.baseFrequencyGHz ?? null,
            features: payload.cpu.features ?? [],
            hardwareCpuId: linked.cpuId,
            tier: linked.cpuTier,
          },
          gpus,
          primaryGpuIndex: linked.primaryGpuIndex,
          primaryGpuConfidence: payload.primaryGpuConfidence,
          memory: payload.memory,
          storage: payload.storage || {},
          detectionErrors: payload.detectionErrors || [],
          rawPayload: payload,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    void saveEvent({
      event: isCreate ? "hardware_profile_created" : "hardware_profile_updated",
      properties: {
        os: payload.os.family,
        arch: payload.os.arch,
        cpuTier: linked.cpuTier,
        gpuTier: linked.gpuTier,
        ramMB: payload.memory.totalMB,
        gpuCount: payload.gpus.length,
      },
      userId,
    });

    return NextResponse.json({ success: true, profile: await publicProfile(doc as never) });
  } catch (err) {
    console.error("Hardware profile PUT failed:", err);
    if (err && typeof err === "object" && "issues" in err) {
      return NextResponse.json({ error: "Invalid hardware profile" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  const deviceId = deviceIdFrom(new URL(req.url));
  await UserHardwareProfile.deleteOne({ userId, deviceId });
  void saveEvent({
    event: "hardware_profile_deleted",
    properties: { deviceId },
    userId,
  });
  return NextResponse.json({ success: true });
}
