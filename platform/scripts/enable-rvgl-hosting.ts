/**
 * One-time, field-scoped enrollment of RVGL in the saved Basic hosting tier.
 * Dry run by default. Never replaces a tier, price, or existing game entry.
 *
 *   npx tsx scripts/enable-rvgl-hosting.ts
 *   npx tsx scripts/enable-rvgl-hosting.ts --apply
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ default: dbConnect }, { default: DedicatedHostingTier }, { default: CatalogGame }, { normalizeStatus }] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/models/DedicatedHostingTier"),
    import("../src/lib/models/CatalogGame"),
    import("../src/lib/catalogStatus"),
  ]);
  await dbConnect();
  const [tier, game] = await Promise.all([
    DedicatedHostingTier.findOne({ key: "basic" }).select("key regions games").lean(),
    CatalogGame.findOne({ slug: "re-volt-rvgl" }).select("slug title status published").lean(),
  ]);
  if (!tier) throw new Error("Saved Basic hosting tier is missing; no changes made");
  if (!game || normalizeStatus(game) !== "published") {
    throw new Error("RVGL catalog game is not published; no changes made");
  }
  const key = "re-volt-rvgl:base";
  const existing = tier.games.find((entry: { profileKey: string }) => entry.profileKey === key);
  if (existing) {
    console.log(JSON.stringify({ tier: "basic", game: key, existing, action: "none: existing entry requires admin review" }, null, 2));
    return;
  }
  const regions = tier.regions.map((region: { key: string }) => region.key);
  if (!regions.length) throw new Error("Basic tier has no regions; no changes made");
  const entry = {
    profileKey: key,
    enabled: true,
    newServerCreationEnabled: true,
    existingServerStartEnabled: true,
    supportedRegions: regions,
    allowedMods: [],
    adminNote: "RVGL private-host pilot: lobby controls available; human Join and completed race pending verification.",
  };
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ tier: "basic", game: key, entry, action: "dry-run" }, null, 2));
    return;
  }
  const result = await DedicatedHostingTier.updateOne(
    { _id: tier._id, key: "basic", "games.profileKey": { $ne: key } },
    { $push: { games: entry } },
    { runValidators: true },
  );
  if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
    throw new Error("Basic tier changed while enrolling RVGL; no entry was added");
  }
  console.log(JSON.stringify({ tier: "basic", game: key, action: "added" }));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
