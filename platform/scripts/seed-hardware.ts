/**
 * Seed curated CPU/GPU knowledge rows with performance tiers.
 * Safe to re-run — upserts by identityKey without clobbering admin edits
 * when source is already "admin".
 */
import { loadEnvConfig } from "@next/env";
import { CPUS, GPUS } from "./hardware-catalog-data";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.MONGODB_URI) {
    console.warn("seed:hardware skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const HardwareCpu = (await import("../src/lib/models/HardwareCpu")).default;
  const HardwareGpu = (await import("../src/lib/models/HardwareGpu")).default;

  await dbConnect();

  let cpuUpserted = 0;
  for (const c of CPUS) {
    const existing = await HardwareCpu.findOne({ identityKey: c.key });
    if (existing?.source === "admin") continue;
    await HardwareCpu.findOneAndUpdate(
      { identityKey: c.key },
      {
        $set: {
          manufacturer: c.manufacturer,
          model: c.model,
          displayName: c.displayName,
          cores: c.cores ?? null,
          threads: c.threads ?? null,
          tier: c.tier,
          source: "seed",
        },
        $setOnInsert: { aliases: [] },
      },
      { upsert: true }
    );
    cpuUpserted += 1;
  }

  let gpuUpserted = 0;
  for (const g of GPUS) {
    const existing = await HardwareGpu.findOne({ identityKey: g.key });
    if (existing?.source === "admin") continue;
    await HardwareGpu.findOneAndUpdate(
      { identityKey: g.key },
      {
        $set: {
          manufacturer: g.manufacturer,
          model: g.model,
          displayName: g.displayName,
          typicalVramMB: g.vram ?? null,
          tier: g.tier,
          source: "seed",
        },
        $setOnInsert: { aliases: [], apis: [] },
      },
      { upsert: true }
    );
    gpuUpserted += 1;
  }

  console.log(`seed:hardware upserted ${cpuUpserted} CPUs, ${gpuUpserted} GPUs`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
