import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import LibraryEntry from "@/lib/models/LibraryEntry";
import { groupInstallsBySlug, editionsFromRow } from "./installedEditions";
import { libraryHasRequiredEdition } from "@/lib/playTogether/editionMatch";

/*
 * `mongodb-memory-server` is deliberately NOT a dependency of this project.
 * It pulls a mongod binary, and every Vercel build installs devDependencies —
 * a cost the deploy should not carry for a test. Install it when you want to
 * run this file and it runs; otherwise these skip:
 *
 *   npm install --no-save mongodb-memory-server && npx vitest run src/lib/library
 */
// @ts-expect-error optional dev dependency for local integration runs
let MongoMemoryServer: typeof import("mongodb-memory-server").MongoMemoryServer | null = null;
try {
  ({ MongoMemoryServer } = require("mongodb-memory-server"));
} catch {
  MongoMemoryServer = null;
}
const withMongo = MongoMemoryServer ? describe : describe.skip;

/**
 * The write path, against a real MongoDB.
 *
 * The unit tests cover the grouping and the reading, but the bug lived in
 * neither — it lived in `$set` against a unique key, which only a real database
 * demonstrates. These drive the same update the batch route issues and read the
 * document back, so "the row keeps every edition" is proven rather than argued.
 *
 * Uses an in-process mongod, so it touches nothing outside this test.
 */

let mongod: InstanceType<NonNullable<typeof MongoMemoryServer>>;

beforeAll(async () => {
  mongod = await MongoMemoryServer!.create();
  await mongoose.connect(mongod.getUri(), { dbName: "pb-test" });
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

const userId = () => new mongoose.Types.ObjectId();

/** The write the batch route performs, for one grouped game. */
async function writeGrouped(
  uid: mongoose.Types.ObjectId,
  installs: Array<{ slug: string; editionSlug?: string | null; version?: string }>
) {
  const now = new Date();
  for (const item of groupInstallsBySlug(installs)) {
    await LibraryEntry.findOneAndUpdate(
      { userId: uid, gameSlug: item.slug, platform: "desktop" },
      {
        $set: {
          installed: true,
          version: item.version || undefined,
          editionSlug: item.editionSlug,
          installedEditions: item.installedEditions,
          installedAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          userId: uid,
          gameSlug: item.slug,
          platform: "desktop",
          source: "launcher",
          saved: false,
          addedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  }
}

/** The write the OLD batch route performed — one per edition, each clobbering. */
async function writeUngrouped(
  uid: mongoose.Types.ObjectId,
  installs: Array<{ slug: string; editionSlug?: string | null }>
) {
  const now = new Date();
  for (const item of installs) {
    await LibraryEntry.findOneAndUpdate(
      { userId: uid, gameSlug: item.slug, platform: "desktop" },
      {
        $set: { installed: true, editionSlug: item.editionSlug ?? null, updatedAt: now },
        $setOnInsert: {
          userId: uid,
          gameSlug: item.slug,
          platform: "desktop",
          source: "launcher",
          addedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  }
}

const TWO_EDITIONS = [
  { slug: "holocure", editionSlug: "holocure-playbound" },
  { slug: "holocure", editionSlug: "official" },
];

withMongo("the original bug, against a real database", () => {
  it("reproduces the loss with the old per-edition write", async () => {
    /*
     * Guards the diagnosis itself. If this ever stops losing an edition, the
     * fix below is no longer testing what it claims to.
     */
    const uid = userId();
    await writeUngrouped(uid, TWO_EDITIONS);

    const rows = await LibraryEntry.find({ userId: uid, gameSlug: "holocure" }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].editionSlug).toBe("official");

    const installed = editionsFromRow(rows[0]);
    expect(libraryHasRequiredEdition(installed, "holocure-playbound")).toBe(false);
  });

  it("keeps both editions with the grouped write", async () => {
    const uid = userId();
    await writeGrouped(uid, TWO_EDITIONS);

    const rows = await LibraryEntry.find({ userId: uid, gameSlug: "holocure" }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].installedEditions.sort()).toEqual(["holocure-playbound", "official"]);

    const installed = editionsFromRow(rows[0]);
    expect(libraryHasRequiredEdition(installed, "holocure-playbound")).toBe(true);
    expect(libraryHasRequiredEdition(installed, "official")).toBe(true);
  });
});

withMongo("the unique index still holds", () => {
  it("keeps one row per game per platform across repeat syncs", async () => {
    const uid = userId();
    await writeGrouped(uid, TWO_EDITIONS);
    await writeGrouped(uid, TWO_EDITIONS);
    expect(await LibraryEntry.countDocuments({ userId: uid, gameSlug: "holocure" })).toBe(1);
  });

  it("drops an edition the player removed on the next sync", async () => {
    // The batch is authoritative; a stale edition must not linger forever.
    const uid = userId();
    await writeGrouped(uid, TWO_EDITIONS);
    await writeGrouped(uid, [{ slug: "holocure", editionSlug: "official" }]);

    const row = await LibraryEntry.findOne({ userId: uid, gameSlug: "holocure" }).lean();
    expect(row!.installedEditions).toEqual(["official"]);
    expect(libraryHasRequiredEdition(editionsFromRow(row!), "holocure-playbound")).toBe(false);
  });
});

withMongo("legacy rows written before installedEditions existed", () => {
  it("still resolve from editionSlug alone", async () => {
    /*
     * Production is full of these. An empty array must read as "not recorded",
     * never as "nothing installed" — that would be a worse bug than the
     * original.
     */
    const uid = userId();
    await LibraryEntry.collection.insertOne({
      userId: uid,
      gameSlug: "holocure",
      platform: "desktop",
      installed: true,
      editionSlug: "holocure-playbound",
      addedAt: new Date(),
      updatedAt: new Date(),
    });

    const row = await LibraryEntry.findOne({ userId: uid, gameSlug: "holocure" }).lean();
    expect(row!.installedEditions).toBeUndefined();
    expect(libraryHasRequiredEdition(editionsFromRow(row!), "holocure-playbound")).toBe(true);
  });
});

withMongo("uninstalling one edition", () => {
  it("keeps the game when another build is still installed", async () => {
    const uid = userId();
    await writeGrouped(uid, TWO_EDITIONS);

    // The single-item route's uninstall branch.
    const entry = await LibraryEntry.findOne({ userId: uid, gameSlug: "holocure" });
    const remaining = entry!.installedEditions.filter(
      (s: string) => s !== "holocure-playbound"
    );
    expect(remaining.length).toBeGreaterThan(0);
    entry!.installedEditions = remaining;
    entry!.editionSlug = remaining[0];
    await entry!.save();

    const row = await LibraryEntry.findOne({ userId: uid, gameSlug: "holocure" }).lean();
    expect(row!.installed).toBe(true);
    expect(row!.installedEditions).toEqual(["official"]);
    // The game is still playable, which the old delete-the-row behaviour denied.
    expect(libraryHasRequiredEdition(editionsFromRow(row!), null)).toBe(true);
  });
});

withMongo("prune", () => {
  it("does not revoke a store or browser install", async () => {
    /*
     * The launcher reports only what it installed. Sweeping everything else
     * was marking games uninstalled that the launcher never put there.
     */
    const uid = userId();
    const now = new Date();
    await LibraryEntry.create([
      {
        userId: uid,
        gameSlug: "from-launcher",
        platform: "desktop",
        installed: true,
        source: "launcher",
        addedAt: now,
      },
      {
        userId: uid,
        gameSlug: "from-store",
        platform: "desktop",
        installed: true,
        source: "store_redirect",
        addedAt: now,
      },
    ]);

    // The prune the batch route runs when the launcher reports nothing but a
    // third, unrelated game.
    await LibraryEntry.updateMany(
      {
        userId: uid,
        installed: true,
        gameSlug: { $nin: ["something-else"] },
        $and: [
          { $or: [{ platform: "desktop" }, { platform: { $exists: false } }, { platform: null }] },
          {
            $or: [
              { source: "launcher" },
              { source: "manual" },
              { source: { $exists: false } },
            ],
          },
        ],
      },
      { $set: { installed: false, saved: true, updatedAt: now } }
    );

    const launcherRow = await LibraryEntry.findOne({ userId: uid, gameSlug: "from-launcher" }).lean();
    const storeRow = await LibraryEntry.findOne({ userId: uid, gameSlug: "from-store" }).lean();
    expect(launcherRow!.installed).toBe(false);
    expect(storeRow!.installed).toBe(true);
  });
});
