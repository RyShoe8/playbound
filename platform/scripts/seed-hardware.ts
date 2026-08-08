/**
 * Seed curated CPU/GPU knowledge rows with performance tiers.
 * Safe to re-run — upserts by identityKey without clobbering admin edits
 * when source is already "admin".
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Tier = "entry" | "low" | "mid" | "high" | "enthusiast";

const CPUS: { key: string; manufacturer: string; model: string; displayName: string; tier: Tier; cores?: number; threads?: number }[] = [
  { key: "intel-core-i3-10100", manufacturer: "Intel", model: "i3-10100", displayName: "Intel Core i3-10100", tier: "low", cores: 4, threads: 8 },
  { key: "intel-core-i5-10400", manufacturer: "Intel", model: "i5-10400", displayName: "Intel Core i5-10400", tier: "mid", cores: 6, threads: 12 },
  { key: "intel-core-i5-12400", manufacturer: "Intel", model: "i5-12400", displayName: "Intel Core i5-12400", tier: "mid", cores: 6, threads: 12 },
  { key: "intel-core-i5-13600k", manufacturer: "Intel", model: "i5-13600K", displayName: "Intel Core i5-13600K", tier: "high", cores: 14, threads: 20 },
  { key: "intel-core-i7-12700k", manufacturer: "Intel", model: "i7-12700K", displayName: "Intel Core i7-12700K", tier: "high", cores: 12, threads: 20 },
  { key: "intel-core-i7-13700k", manufacturer: "Intel", model: "i7-13700K", displayName: "Intel Core i7-13700K", tier: "high", cores: 16, threads: 24 },
  { key: "intel-core-i9-13900k", manufacturer: "Intel", model: "i9-13900K", displayName: "Intel Core i9-13900K", tier: "enthusiast", cores: 24, threads: 32 },
  { key: "amd-ryzen-3-3100", manufacturer: "AMD", model: "Ryzen 3 3100", displayName: "AMD Ryzen 3 3100", tier: "low", cores: 4, threads: 8 },
  { key: "amd-ryzen-5-3600", manufacturer: "AMD", model: "Ryzen 5 3600", displayName: "AMD Ryzen 5 3600", tier: "mid", cores: 6, threads: 12 },
  { key: "amd-ryzen-5-5600", manufacturer: "AMD", model: "Ryzen 5 5600", displayName: "AMD Ryzen 5 5600", tier: "mid", cores: 6, threads: 12 },
  { key: "amd-ryzen-5-5600x", manufacturer: "AMD", model: "Ryzen 5 5600X", displayName: "AMD Ryzen 5 5600X", tier: "mid", cores: 6, threads: 12 },
  { key: "amd-ryzen-5-7600", manufacturer: "AMD", model: "Ryzen 5 7600", displayName: "AMD Ryzen 5 7600", tier: "high", cores: 6, threads: 12 },
  { key: "amd-ryzen-7-5800x", manufacturer: "AMD", model: "Ryzen 7 5800X", displayName: "AMD Ryzen 7 5800X", tier: "high", cores: 8, threads: 16 },
  { key: "amd-ryzen-7-7800x3d", manufacturer: "AMD", model: "Ryzen 7 7800X3D", displayName: "AMD Ryzen 7 7800X3D", tier: "enthusiast", cores: 8, threads: 16 },
  { key: "amd-ryzen-9-7950x", manufacturer: "AMD", model: "Ryzen 9 7950X", displayName: "AMD Ryzen 9 7950X", tier: "enthusiast", cores: 16, threads: 32 },
  { key: "apple-m1", manufacturer: "Apple", model: "M1", displayName: "Apple M1", tier: "mid" },
  { key: "apple-m2", manufacturer: "Apple", model: "M2", displayName: "Apple M2", tier: "mid" },
  { key: "apple-m3", manufacturer: "Apple", model: "M3", displayName: "Apple M3", tier: "high" },
  { key: "apple-m3-pro", manufacturer: "Apple", model: "M3 Pro", displayName: "Apple M3 Pro", tier: "high" },
  { key: "apple-m3-max", manufacturer: "Apple", model: "M3 Max", displayName: "Apple M3 Max", tier: "enthusiast" },
];

const GPUS: { key: string; manufacturer: string; model: string; displayName: string; tier: Tier; vram?: number }[] = [
  { key: "nvidia-geforce-gtx-1050-ti", manufacturer: "NVIDIA", model: "GTX 1050 Ti", displayName: "NVIDIA GeForce GTX 1050 Ti", tier: "entry", vram: 4096 },
  { key: "nvidia-geforce-gtx-1650", manufacturer: "NVIDIA", model: "GTX 1650", displayName: "NVIDIA GeForce GTX 1650", tier: "low", vram: 4096 },
  { key: "nvidia-geforce-gtx-1660-super", manufacturer: "NVIDIA", model: "GTX 1660 Super", displayName: "NVIDIA GeForce GTX 1660 SUPER", tier: "low", vram: 6144 },
  { key: "nvidia-geforce-rtx-2060", manufacturer: "NVIDIA", model: "RTX 2060", displayName: "NVIDIA GeForce RTX 2060", tier: "mid", vram: 6144 },
  { key: "nvidia-geforce-rtx-3060", manufacturer: "NVIDIA", model: "RTX 3060", displayName: "NVIDIA GeForce RTX 3060", tier: "mid", vram: 12288 },
  { key: "nvidia-geforce-rtx-3070", manufacturer: "NVIDIA", model: "RTX 3070", displayName: "NVIDIA GeForce RTX 3070", tier: "high", vram: 8192 },
  { key: "nvidia-geforce-rtx-3080", manufacturer: "NVIDIA", model: "RTX 3080", displayName: "NVIDIA GeForce RTX 3080", tier: "high", vram: 10240 },
  { key: "nvidia-geforce-rtx-4060", manufacturer: "NVIDIA", model: "RTX 4060", displayName: "NVIDIA GeForce RTX 4060", tier: "mid", vram: 8192 },
  { key: "nvidia-geforce-rtx-4070", manufacturer: "NVIDIA", model: "RTX 4070", displayName: "NVIDIA GeForce RTX 4070", tier: "high", vram: 12288 },
  { key: "nvidia-geforce-rtx-4080", manufacturer: "NVIDIA", model: "RTX 4080", displayName: "NVIDIA GeForce RTX 4080", tier: "enthusiast", vram: 16384 },
  { key: "nvidia-geforce-rtx-4090", manufacturer: "NVIDIA", model: "RTX 4090", displayName: "NVIDIA GeForce RTX 4090", tier: "enthusiast", vram: 24576 },
  { key: "amd-radeon-rx-580", manufacturer: "AMD", model: "RX 580", displayName: "AMD Radeon RX 580", tier: "low", vram: 8192 },
  { key: "amd-radeon-rx-6600", manufacturer: "AMD", model: "RX 6600", displayName: "AMD Radeon RX 6600", tier: "mid", vram: 8192 },
  { key: "amd-radeon-rx-6700-xt", manufacturer: "AMD", model: "RX 6700 XT", displayName: "AMD Radeon RX 6700 XT", tier: "high", vram: 12288 },
  { key: "amd-radeon-rx-7600", manufacturer: "AMD", model: "RX 7600", displayName: "AMD Radeon RX 7600", tier: "mid", vram: 8192 },
  { key: "amd-radeon-rx-7800-xt", manufacturer: "AMD", model: "RX 7800 XT", displayName: "AMD Radeon RX 7800 XT", tier: "high", vram: 16384 },
  { key: "amd-radeon-rx-7900-xtx", manufacturer: "AMD", model: "RX 7900 XTX", displayName: "AMD Radeon RX 7900 XTX", tier: "enthusiast", vram: 24576 },
  { key: "intel-arc-a750", manufacturer: "Intel", model: "Arc A750", displayName: "Intel Arc A750", tier: "mid", vram: 8192 },
  { key: "intel-uhd-graphics-630", manufacturer: "Intel", model: "UHD Graphics 630", displayName: "Intel UHD Graphics 630", tier: "entry" },
  { key: "intel-iris-xe-graphics", manufacturer: "Intel", model: "Iris Xe Graphics", displayName: "Intel Iris Xe Graphics", tier: "entry" },
];

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
