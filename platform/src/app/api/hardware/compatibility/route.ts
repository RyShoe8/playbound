import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import UserHardwareProfile from "@/lib/models/UserHardwareProfile";
import HardwareGpu from "@/lib/models/HardwareGpu";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getGame } from "@/lib/catalog";
import { listPublicEditionsForGame, getEditionById, getEditionBySlug } from "@/lib/editions";
import { getMod } from "@/lib/mods";
import {
  effectiveHardwareRequirements,
  evaluateCompatibility,
  type HardwareRequirementsBlock,
  type ModHardwareRequirements,
  type UserHardwareForCompat,
} from "@/lib/hardware";
import { parseFreeTextRequirementsBlock } from "@/lib/hardware/parseFreeTextRequirements";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameSlug = url.searchParams.get("gameSlug")?.trim();
  if (!gameSlug) {
    return NextResponse.json({ error: "gameSlug required" }, { status: 400 });
  }

  const editionSlug = url.searchParams.get("editionSlug")?.trim() || null;
  const modSlugs = (url.searchParams.get("modSlugs") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const userId = await getFriendsUserId(req);
  await dbConnect();

  /*
   * Testing games included: this route only reads requirements to answer "will
   * this run on my PC", and a game being unpublished is exactly when someone is
   * checking it. Without this the panel 404s and — because the client reads
   * `data?.result ?? null` — shows nothing rather than an error, so the check
   * silently does nothing on every testing entry.
   */
  const game = await getGame(gameSlug, { includeTesting: true });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  let editionBlock: HardwareRequirementsBlock | null = null;
  if (editionSlug) {
    try {
      const editions = await listPublicEditionsForGame(game);
      const ed = editions.find((e) => e.slug === editionSlug);
      if (ed?.hardwareRequirements) {
        editionBlock = ed.hardwareRequirements as HardwareRequirementsBlock;
      } else if (ed?.requirements) {
        editionBlock = parseFreeTextRequirementsBlock(ed.requirements);
      } else {
        /*
         * Hidden editions included. listPublicEditionsForGame above drops them
         * by design, and without this getEditionBySlug drops them too — so a
         * hidden edition fell through to getEditionById, which is given a slug
         * and cannot cast one, leaving editionBlock null. The check then
         * silently graded the base game instead of the edition actually being
         * played. Hidden means "not listed", not "not reachable": the caller
         * has already named this edition, so answering for it is the point.
         */
        const bySlug = await getEditionBySlug(game, editionSlug, { includeHidden: true });
        if (bySlug?.hardwareRequirements) {
          editionBlock = bySlug.hardwareRequirements as HardwareRequirementsBlock;
        } else if (bySlug?.requirements) {
          editionBlock = parseFreeTextRequirementsBlock(bySlug.requirements);
        } else {
          const byId = await getEditionById(editionSlug);
          if (byId?.gameSlug === gameSlug) {
            if (byId.hardwareRequirements) {
              editionBlock = byId.hardwareRequirements as HardwareRequirementsBlock;
            } else if (byId.requirements) {
              editionBlock = parseFreeTextRequirementsBlock(byId.requirements);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const modBlocks: ModHardwareRequirements[] = [];
  for (const slug of modSlugs) {
    const mod = await getMod(slug).catch(() => null);
    if (mod?.baseGameSlug === gameSlug && mod.hardwareRequirements) {
      modBlocks.push(mod.hardwareRequirements);
    }
  }

  const gameHardwareBlock =
    (game.hardwareRequirements as HardwareRequirementsBlock | null | undefined) ||
    parseFreeTextRequirementsBlock(game.systemRequirements);

  const requirements = effectiveHardwareRequirements(
    gameHardwareBlock,
    editionBlock,
    modBlocks
  );

  let userCompat: UserHardwareForCompat | null = null;
  let hasProfile = false;
  if (userId) {
    const profile = await UserHardwareProfile.findOne({ userId }).lean();
    if (profile) {
      hasProfile = true;
      const idx = profile.primaryGpuIndex;
      const primary =
        idx != null && Array.isArray(profile.gpus) ? profile.gpus[idx] : profile.gpus?.[0];
      userCompat = {
        osFamily: profile.os?.family,
        arch: profile.os?.arch,
        cpuDisplay: profile.cpu?.displayName || profile.cpu?.rawName,
        cpuTier: (profile.cpu?.tier as UserHardwareForCompat["cpuTier"]) || "unknown",
        gpuDisplay: primary?.displayName || primary?.rawName || null,
        gpuTier: "unknown",
        vramMB: primary?.vramMB ?? null,
        ramMB: profile.memory?.totalMB ?? null,
        storageMB:
          profile.storage?.installDrive?.freeMB ?? profile.storage?.totalAvailableMB ?? null,
      };
      if (primary?.hardwareGpuId) {
        const gpuDoc = await HardwareGpu.findById(primary.hardwareGpuId).lean();
        if (gpuDoc?.tier) {
          userCompat.gpuTier = gpuDoc.tier as UserHardwareForCompat["gpuTier"];
        }
      }
    }
  }

  const result = evaluateCompatibility(userCompat, requirements);

  if (userId) {
    void saveEvent({
      event: "compatibility_checked",
      properties: {
        gameSlug,
        verdict: result.verdict,
        hasProfile,
      },
      userId,
    });
  }

  return NextResponse.json({
    hasProfile,
    requirements,
    result,
  });
}
