/**
 * Insert-only PlayBound Controls rollout. No catalog game/edition fields are
 * updated. Dry run by default; --apply inserts only missing target profiles.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { controlProfileSchema } from "../src/lib/controlProfiles/schema";
import { testingControlProfiles } from "./control-profiles/wave-1";
import { testingControlProfilesWave2 } from "./control-profiles/wave-2";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(scriptDir, "..");
const validUri = (value: string | undefined) => Boolean(value && /^mongodb(\+srv)?:\/\//i.test(value));

function loadMongoUri() {
  if (validUri(process.env.MONGODB_URI)) return;
  for (const file of [".env.production.local", ".env.local", ".env"]) {
    const filename = resolve(platformDir, file);
    if (!existsSync(filename)) continue;
    for (const raw of readFileSync(filename, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const pos = line.indexOf("=");
      if (line.slice(0, pos).trim() !== "MONGODB_URI") continue;
      let value = line.slice(pos + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (validUri(value)) process.env.MONGODB_URI = value;
    }
    if (validUri(process.env.MONGODB_URI)) return;
  }
  throw new Error("A MongoDB connection is required. No profile was written.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error(`Unknown argument(s): ${args.join(", ")}`);
  const apply = args.includes("--apply");
  const pilot = JSON.parse(readFileSync(resolve(platformDir, "../launcher/services/inputEngine/profiles/outrun.json"), "utf8"));
  const profiles = [
    controlProfileSchema.parse({
      ...pilot,
      version: "0.1.1",
      status: "verified",
      antiCheatCompatibility: "verified",
      testedControllers: ["DualSense Wireless Controller (Windows)"],
      notes: "Physically tested in OutRun 4.0 on Windows with a DualSense controller. Standalone open-source remake; no anti-cheat integration. D-pad and left stick both steer by choice; Start confirms.",
    }),
    ...testingControlProfiles.map((profile) => controlProfileSchema.parse(profile)),
    ...testingControlProfilesWave2.map((profile) => controlProfileSchema.parse(profile)),
  ];
  const keys = profiles.map((p) => `${p.gameSlug}::${p.editionSlug || ""}`);
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate profile target in the wave.");

  loadMongoUri();
  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const ControlProfile = (await import("../src/lib/models/ControlProfile")).default;
  await dbConnect();
  const slugs = profiles.map((p) => p.gameSlug);
  const games = await CatalogGame.find({ slug: { $in: slugs } }).select("slug title status published").lean();
  const bySlug = new Map(games.map((game) => [game.slug, game]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  const unpublished = slugs.filter((slug) => bySlug.has(slug) && (bySlug.get(slug)?.status !== "published" || bySlug.get(slug)?.published === false));
  if (missing.length) console.log(`[controls wave] skipped missing catalog games: ${missing.join(", ")}`);
  if (unpublished.length) console.log(`[controls wave] skipped unpublished catalog games: ${unpublished.join(", ")}`);
  const existing = await ControlProfile.find({ gameSlug: { $in: slugs } }).select("gameSlug editionSlug status").lean();
  const existingKeys = new Set(existing.map((p) => `${p.gameSlug}::${p.editionSlug || ""}`));
  const pending = profiles.filter((p) => bySlug.get(p.gameSlug)?.status === "published" && bySlug.get(p.gameSlug)?.published !== false && !existingKeys.has(`${p.gameSlug}::${p.editionSlug || ""}`));
  console.log(`[controls wave] ${profiles.length} valid profiles, ${pending.length} inserts, ${profiles.length - pending.length} existing targets left untouched.`);
  for (const p of pending) console.log(`  ${p.gameSlug}: ${p.status}`);
  if (!apply) { console.log("Dry run complete. Pass --apply to insert the listed profiles."); return; }
  for (const profile of pending) {
    const again = await ControlProfile.exists({ gameSlug: profile.gameSlug, editionSlug: profile.editionSlug });
    if (again) throw new Error(`${profile.gameSlug}: target appeared during rollout; stopping without overwriting it.`);
    await ControlProfile.create(profile);
    console.log(`Inserted ${profile.gameSlug} (${profile.status})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error("Control-profile wave failed:", error instanceof Error ? error.message : error); process.exit(1); });
