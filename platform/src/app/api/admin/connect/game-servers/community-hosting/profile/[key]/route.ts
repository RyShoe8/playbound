import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { profileSettingsSchema, validateProfileReadiness } from "@/lib/communityHosting/profileSettings";

export async function PUT(req: Request, context: { params: Promise<{ key: string }> }) {
  const { session, error } = await requireAdminSession();
  if (error) return error;
  const { key } = await context.params;
  const normalizedKey = key.toLowerCase();
  if (!/^[a-z0-9_-]+:[a-z0-9_.-]+$/.test(normalizedKey)) return NextResponse.json({ error: "Invalid profile key" }, { status: 400 });
  const parsed = profileSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid profile settings" }, { status: 400 });
  await dbConnect();
  const current = await CommunityServerProfile.findOne({ key: normalizedKey }).lean();

  const [gameSlug, editionPart] = normalizedKey.split(":");
  const editionSlug = editionPart === "base" ? null : editionPart;
  const base = current ? null : await CommunityServerProfile.findOne({
    gameSlug,
    $or: [{ editionSlug: null }, { key: `${gameSlug}:base` }],
  }).lean();

  const sampleCount = current?.sampleCount ?? base?.sampleCount ?? 0;
  const cpuCores = (current?.envelope?.cpuCores && current.envelope.cpuCores > 0)
    ? current.envelope.cpuCores
    : (base?.envelope?.cpuCores && base.envelope.cpuCores > 0 ? base.envelope.cpuCores : 0.25);
  const ramBytes = (current?.envelope?.ramBytes && current.envelope.ramBytes > 0)
    ? current.envelope.ramBytes
    : (base?.envelope?.ramBytes && base.envelope.ramBytes > 0 ? base.envelope.ramBytes : 512 * 1024 * 1024);
  const measuredThroughPlayers = current?.envelope?.measuredThroughPlayers ?? base?.envelope?.measuredThroughPlayers ?? 0;

  const reason = validateProfileReadiness(parsed.data, {
    sampleCount,
    cpuCores,
    ramBytes,
    measuredThroughPlayers,
  });
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  const updated = await CommunityServerProfile.findOneAndUpdate(
    { key: normalizedKey },
    {
      $set: {
        ...parsed.data,
        updatedBy: session!.user.id,
        ...((!current?.envelope?.cpuCores || !current?.envelope?.ramBytes) ? {
          envelope: { cpuCores, ramBytes, measuredThroughPlayers },
        } : {}),
      },
      $setOnInsert: {
        key: normalizedKey,
        gameSlug,
        editionSlug,
        recipeSlug: base?.recipeSlug || gameSlug,
        envelope: base?.envelope || { cpuCores, ramBytes, measuredThroughPlayers },
        sampleCount,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return NextResponse.json({ ok: true, profile: updated });
}
