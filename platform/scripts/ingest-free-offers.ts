/**
 * Run free offers ingestion from the command line.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("ingest:free-offers skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const { ingestFreeOffers } = await import("../src/lib/freeOffers/ingestion");

  console.log("Connecting to database...");
  await dbConnect();

  console.log("Ingesting free offers from Epic, Steam, GOG, Prime Gaming...");
  const results = await ingestFreeOffers();

  console.log("\n--- Ingestion Results ---");
  for (const r of results) {
    console.log(
      `[${r.provider}] Status: ${r.status} | Found: ${r.offersFound} | Created: ${r.offersCreated} | Updated: ${r.offersUpdated} | Expired: ${r.offersExpired} | Matched: ${r.gamesMatched} (${r.durationMs}ms)`
    );
    if (r.error) {
      console.error(`  Error: ${r.error}`);
    }
  }

  const FreeOffer = (await import("../src/lib/models/FreeOffer")).default;
  const activeCount = await FreeOffer.countDocuments({ isActive: true });
  console.log(`\nActive free offers in DB: ${activeCount}`);
}

main().catch((err) => {
  console.error("ingest:free-offers failed:", err);
  process.exit(1);
});
