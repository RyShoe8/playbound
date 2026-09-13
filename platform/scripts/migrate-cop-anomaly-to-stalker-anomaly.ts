/**
 * Move Call of Pripyat + anomaly library/party/invite rows onto the new
 * stalker-anomaly game (official edition).
 *
 * CoP/anomaly is retired as an edition; Anomaly is its own CatalogGame.
 * renameGameSlug cannot cover edition→game remaps — this script does.
 *
 * Never deletes CatalogGame / Edition rows. Never touches SoC or CoP game docs.
 *
 * Usage:
 *   npx tsx scripts/migrate-cop-anomaly-to-stalker-anomaly.ts
 *   npx tsx scripts/migrate-cop-anomaly-to-stalker-anomaly.ts --apply
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const COP = "s-t-a-l-k-e-r-call-of-pripyat";
const ANOMALY_EDITION = "anomaly";
const TARGET_GAME = "stalker-anomaly";
const TARGET_EDITION = "official";

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGODB_URI) {
    console.warn("migrate-cop-anomaly-to-stalker-anomaly skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const LibraryEntry = (await import("../src/lib/models/LibraryEntry")).default;
  const Party = (await import("../src/lib/models/Party")).default;
  const PlayInvite = (await import("../src/lib/models/PlayInvite")).default;

  await dbConnect();

  const libraryQuery = {
    gameSlug: COP,
    $or: [
      { editionSlug: ANOMALY_EDITION },
      { installedEditions: ANOMALY_EDITION },
    ],
  };

  const partyQuery = {
    gameSlug: COP,
    editionSlug: ANOMALY_EDITION,
  };

  const inviteQuery = {
    gameSlug: COP,
    editionSlug: ANOMALY_EDITION,
  };

  const libraryCount = await LibraryEntry.countDocuments(libraryQuery);
  const partyCount = await Party.countDocuments(partyQuery);
  const inviteCount = await PlayInvite.countDocuments(inviteQuery);

  console.log(
    `Preview: library=${libraryCount} party=${partyCount} playInvite=${inviteCount}` +
      ` (CoP + anomaly → ${TARGET_GAME}/${TARGET_EDITION})`
  );

  if (!apply) {
    console.log("DRY RUN — pass --apply to write. No documents were modified.");
    process.exit(0);
  }

  let libraryUpserted = 0;
  let libraryUpdated = 0;
  let librarySkipped = 0;

  const libraryRows = await LibraryEntry.find(libraryQuery).lean();
  for (const row of libraryRows) {
    const platform = row.platform ?? "desktop";
    const hadAnomalyPrimary = row.editionSlug === ANOMALY_EDITION;
    const installed = Array.isArray(row.installedEditions)
      ? (row.installedEditions as string[]).filter(
          (e: string) => e && e !== ANOMALY_EDITION
        )
      : [];
    const copStillInstalled = installed.length > 0 || (!hadAnomalyPrimary && row.installed);

    const existingTarget = await LibraryEntry.findOne({
      userId: row.userId,
      gameSlug: TARGET_GAME,
      platform,
    });

    if (existingTarget) {
      const nextEditions = new Set([
        ...(existingTarget.installedEditions ?? []),
        TARGET_EDITION,
      ]);
      await LibraryEntry.updateOne(
        { _id: existingTarget._id },
        {
          $set: {
            installed: true,
            editionSlug: existingTarget.editionSlug || TARGET_EDITION,
            installedEditions: [...nextEditions],
            updatedAt: new Date(),
            ...(row.installedAt && !existingTarget.installedAt
              ? { installedAt: row.installedAt }
              : {}),
          },
        }
      );
      libraryUpserted++;
    } else {
      await LibraryEntry.create({
        userId: row.userId,
        gameSlug: TARGET_GAME,
        platform,
        source: row.source ?? "launcher",
        saved: row.saved ?? false,
        installed: true,
        version: row.version,
        editionSlug: TARGET_EDITION,
        installedEditions: [TARGET_EDITION],
        installedAt: row.installedAt ?? new Date(),
        addedAt: row.addedAt ?? new Date(),
        updatedAt: new Date(),
      });
      libraryUpserted++;
    }

    if (hadAnomalyPrimary && !copStillInstalled) {
      // CoP row only existed for Anomaly — clear install flags, keep saved wishlist.
      await LibraryEntry.updateOne(
        { _id: row._id },
        {
          $set: {
            installed: false,
            editionSlug: null,
            installedEditions: [],
            updatedAt: new Date(),
          },
          $unset: { installedAt: 1 },
        }
      );
      libraryUpdated++;
    } else if (row.installedEditions?.includes(ANOMALY_EDITION) || hadAnomalyPrimary) {
      const nextPrimary =
        hadAnomalyPrimary
          ? installed[0] ?? null
          : row.editionSlug === ANOMALY_EDITION
            ? installed[0] ?? null
            : row.editionSlug;
      await LibraryEntry.updateOne(
        { _id: row._id },
        {
          $set: {
            editionSlug: nextPrimary,
            installedEditions: installed,
            installed: installed.length > 0 || Boolean(nextPrimary),
            updatedAt: new Date(),
          },
        }
      );
      libraryUpdated++;
    } else {
      librarySkipped++;
    }
  }

  const partyRes = await Party.updateMany(partyQuery, {
    $set: { gameSlug: TARGET_GAME, editionSlug: TARGET_EDITION },
  });
  const inviteRes = await PlayInvite.updateMany(inviteQuery, {
    $set: { gameSlug: TARGET_GAME, editionSlug: TARGET_EDITION },
  });

  console.log(
    `Applied: library upserted/merged=${libraryUpserted} library CoP cleaned=${libraryUpdated}` +
      ` skipped=${librarySkipped} parties=${partyRes.modifiedCount}` +
      ` invites=${inviteRes.modifiedCount}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("migrate-cop-anomaly-to-stalker-anomaly failed:", err);
  process.exit(1);
});
