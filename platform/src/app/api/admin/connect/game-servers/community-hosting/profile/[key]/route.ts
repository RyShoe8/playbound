import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CatalogGame from "@/lib/models/CatalogGame";
import Edition from "@/lib/models/Edition";
import { fetchGameHostHealth } from "@/lib/gameHost/client";
import { profileSettingsSchema, validateProfileReadiness } from "@/lib/communityHosting/profileSettings";
import { getEffectiveEnvelope } from "@/lib/communityHosting/reconcile";

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
  if (parsed.data.enabled) {
    const [catalogGame, edition, health] = await Promise.all([
      CatalogGame.findOne({ slug: gameSlug, status: "published", published: true }).select("slug").lean(),
      editionSlug ? Edition.findOne({ gameSlug, slug: editionSlug, status: { $ne: "archived" }, visibility: { $ne: "hidden" }, suppressesSeed: { $ne: true } }).select("features isDefault").lean() : Promise.resolve(null),
      fetchGameHostHealth(),
    ]);
    if (!catalogGame || !health.configured || !health.health.gameStatus?.[gameSlug]?.ready ||
      (editionSlug && (!edition || edition.isDefault || (!edition.features?.includes("Dedicated Servers") && !current)))) {
      return NextResponse.json({ error: "Publish the game and verify its dedicated-server files before enabling community hosting" }, { status: 409 });
    }
  }
  const base = current ? null : await CommunityServerProfile.findOne({
    gameSlug,
    $or: [{ editionSlug: null }, { key: `${gameSlug}:base` }],
  }).lean();

  const sampleCount = current?.sampleCount ?? base?.sampleCount ?? 0;
  const effective = getEffectiveEnvelope(current?.envelope || base?.envelope, gameSlug, sampleCount);
  const cpuCores = effective.cpuCores;
  const ramBytes = effective.ramBytes;
  const measuredThroughPlayers = current?.envelope?.measuredThroughPlayers ?? base?.envelope?.measuredThroughPlayers ?? 0;

  const reason = validateProfileReadiness(parsed.data, {
    sampleCount,
    cpuCores,
    ramBytes,
    measuredThroughPlayers,
  });
  if (reason) return NextResponse.json({ error: reason }, { status: 400 });

  /*
   * The envelope is written in exactly one operator. Setting it in both $set
   * and $setOnInsert is a MongoDB path conflict, which failed every save of a
   * game/edition that had no profile yet with a 500 ("Could not save").
   */
  const needsEnvelope = !current?.envelope?.cpuCores || !current?.envelope?.ramBytes;
  const envelope = current ? { cpuCores, ramBytes, measuredThroughPlayers } : base?.envelope || { cpuCores, ramBytes, measuredThroughPlayers };
  const updated = await CommunityServerProfile.findOneAndUpdate(
    { key: normalizedKey },
    {
      $set: {
        ...parsed.data,
        updatedBy: session!.user.id,
        ...(needsEnvelope ? { envelope } : {}),
      },
      $setOnInsert: {
        key: normalizedKey,
        gameSlug,
        editionSlug,
        recipeSlug: base?.recipeSlug || gameSlug,
        sampleCount,
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return NextResponse.json({ ok: true, profile: updated });
}
