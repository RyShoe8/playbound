/**
 * Seed store provider documents into MongoDB.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:store-providers skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const { ensureCommerceStores } = await import("../src/lib/commerce/ensureStores");
  await ensureCommerceStores();
  console.log("Done: commerce stores inserted or backfilled.");
}

main().catch((err) => {
  console.error("seed:store-providers failed:", err);
  process.exit(1);
});
