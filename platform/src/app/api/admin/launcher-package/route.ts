import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import EditionModel from "@/lib/models/Edition";
import { editions as seedEditions } from "@/lib/data/editions";
import { archiveArtifactOnHost, archivedArtifactStatusOnHost } from "@/lib/gameHost/client";
import { requireAdminSession } from "@/lib/requireAdmin";

const payload = z.object({
  gameSlug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  editionSlug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).optional(),
  sourceUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "Package URL must use HTTPS"),
  fileName: z.string().trim().regex(/^.+\.(zip|7z)$/i, "Upload a .zip or .7z package").max(180),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
  relativePath: z.string().trim().min(1).max(400).optional(),
});

function safePart(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-");
}

function packagePrefix(input: z.infer<typeof payload>) {
  const target = input.editionSlug
    ? `editions/${safePart(input.gameSlug)}/${safePart(input.editionSlug)}`
    : `games/${safePart(input.gameSlug)}`;
  return `launcher-packages/${target}/`;
}

function expectedPath(input: z.infer<typeof payload>) {
  const target = packagePrefix(input);
  const name = `${Date.now()}-${safePart(input.fileName)}`;
  return `${target}${name}`;
}

function mirrorUrl(relativePath: string) {
  return `https://mirror.playbound.club/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function materializeExactSeed(gameSlug: string, editionSlug: string) {
  const seed = seedEditions.find((item) => item.gameSlug === gameSlug && item.slug === editionSlug);
  if (!seed) return null;
  const game = await CatalogGame.findOne({ slug: gameSlug }).select("_id").lean();
  if (!game) return null;
  await EditionModel.updateOne(
    { gameSlug, slug: editionSlug },
    { $setOnInsert: { ...seed, gameId: game._id } },
    { upsert: true }
  );
  return EditionModel.findOne({ gameSlug, slug: editionSlug }).select("_id").lean();
}

/** Queue a package copy, or finalize its URL after VPS verification.
 * Finalization uses only narrowly-scoped $set paths; it never submits an
 * editor form or replaces a game/edition document. */
export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  try {
    const raw = await req.json();
    const action = raw?.action === "finalize" ? "finalize" : "queue";
    const input = payload.parse(raw);
    const relativePath = action === "queue" ? expectedPath(input) : input.relativePath;
    if (!relativePath || !relativePath.startsWith(packagePrefix(input))) {
      return NextResponse.json({ error: "Invalid package path" }, { status: 400 });
    }
    const kind = input.fileName.toLowerCase().endsWith(".7z") ? "direct-7z" : "direct-zip";

    if (action === "queue") {
      const queued = await archiveArtifactOnHost({
        url: input.sourceUrl,
        relativePath,
        sizeBytes: input.sizeBytes,
      });
      if (!queued.success) return NextResponse.json({ error: queued.message || "VPS archive failed" }, { status: 502 });
      return NextResponse.json({ relativePath, status: queued.queued ? "uploading" : "verified" });
    }

    const archive = await archivedArtifactStatusOnHost(relativePath);
    if (archive?.status !== "verified") {
      return NextResponse.json({ status: archive?.status || "missing", error: archive?.message || null }, { status: 202 });
    }

    await dbConnect();
    const url = mirrorUrl(relativePath);
    if (input.editionSlug) {
      let edition = await EditionModel.findOne({ gameSlug: input.gameSlug, slug: input.editionSlug })
        .select("_id installConfig")
        .lean();
      if (!edition) edition = await materializeExactSeed(input.gameSlug, input.editionSlug);
      if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
      // Older/watchlist records can explicitly store installConfig as null.
      // Dotted $set paths cannot create children below null, so replace this
      // one config object while preserving any other installer methods.
      const installConfig =
        edition.installConfig && typeof edition.installConfig === "object"
          ? edition.installConfig
          : {};
      const result = await EditionModel.updateOne(
        { _id: edition._id },
        { $set: {
          installMethod: "playbound_installer",
          installConfig: {
            ...installConfig,
            playbound_installer: {
              ...(installConfig.playbound_installer || {}),
              kind,
              url,
              fileName: input.fileName,
            },
          },
        } }
      );
      if (!result.matchedCount) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    } else {
      const game = await CatalogGame.findOne({ slug: input.gameSlug })
        .select("_id launcherInstall")
        .lean();
      if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
      // Watchlist imports commonly have launcherInstall: null. Merge at the
      // object boundary instead of setting children beneath that null value.
      const launcherInstall =
        game.launcherInstall && typeof game.launcherInstall === "object"
          ? game.launcherInstall
          : {};
      const result = await CatalogGame.updateOne(
        { _id: game._id },
        { $set: {
          launcherInstall: {
            ...launcherInstall,
            enabled: true,
            kind,
            url,
            fileName: input.fileName,
          },
        } }
      );
      if (!result.matchedCount) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ status: "verified", url, kind, fileName: input.fileName });
  } catch (err) {
    console.error("Launcher package archive error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Package upload failed" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const relativePath = new URL(req.url).searchParams.get("relativePath") || "";
  if (!relativePath.startsWith("launcher-packages/")) return NextResponse.json({ error: "Invalid package path" }, { status: 400 });
  const status = await archivedArtifactStatusOnHost(relativePath);
  return NextResponse.json(status || { status: "missing", message: "Game host is not configured" });
}
