/**
 * Seed store provider documents into MongoDB.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_PROVIDERS = [
  {
    slug: "epic",
    name: "Epic Games Store",
    baseUrl: "https://store.epicgames.com",
    color: "oklch(0.70 0.14 220)",
    active: true,
  },
  {
    slug: "steam",
    name: "Steam",
    baseUrl: "https://store.steampowered.com",
    color: "oklch(0.68 0.14 250)",
    active: true,
  },
  {
    slug: "gog",
    name: "GOG",
    baseUrl: "https://www.gog.com",
    color: "oklch(0.72 0.18 310)",
    active: true,
  },
  {
    slug: "prime_gaming",
    name: "Amazon Prime Gaming",
    baseUrl: "https://gaming.amazon.com",
    color: "oklch(0.72 0.18 170)",
    active: true,
  },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:store-providers skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const StoreProvider = (await import("../src/lib/models/StoreProvider")).default;

  await dbConnect();

  let created = 0;
  let skipped = 0;

  for (const p of SEED_PROVIDERS) {
    const existing = await StoreProvider.findOne({ slug: p.slug }).lean();
    if (existing) {
      skipped++;
      continue;
    }
    await StoreProvider.create(p);
    created++;
    console.log(`OK  ${p.slug}`);
  }

  console.log(`\nDone: ${created} created, ${skipped} already present.`);
}

main().catch((err) => {
  console.error("seed:store-providers failed:", err);
  process.exit(1);
});
