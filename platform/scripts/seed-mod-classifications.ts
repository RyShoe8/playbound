import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:mod-classifications skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const { seedDefaultModClassifications } = await import("../src/lib/modClassifications");
  const force = process.argv.includes("--force");

  console.log(`Seeding default mod classifications (force=${force})...`);
  const result = await seedDefaultModClassifications(force);
  console.log(`Seeding complete: ${result.created} created, ${result.existing} already existing.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("seed:mod-classifications failed:", err);
  process.exit(1);
});
