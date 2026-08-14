import { identityKeyFromName } from "../src/lib/hardware/normalize";

export type SeedTier = "entry" | "low" | "mid" | "high" | "enthusiast";

export type SeedCpu = {
  key: string;
  manufacturer: string;
  model: string;
  displayName: string;
  tier: SeedTier;
  cores?: number;
  threads?: number;
};

export type SeedGpu = {
  key: string;
  manufacturer: string;
  model: string;
  displayName: string;
  tier: SeedTier;
  vram?: number;
};

function cpu(
  manufacturer: string,
  model: string,
  displayName: string,
  tier: SeedTier,
  cores?: number,
  threads?: number
): SeedCpu {
  return {
    key: identityKeyFromName(displayName),
    manufacturer,
    model,
    displayName,
    tier,
    cores,
    threads,
  };
}

function gpu(
  manufacturer: string,
  model: string,
  displayName: string,
  tier: SeedTier,
  vram?: number
): SeedGpu {
  return {
    key: identityKeyFromName(displayName),
    manufacturer,
    model,
    displayName,
    tier,
    vram,
  };
}

const intel = (
  model: string,
  tier: SeedTier,
  cores: number,
  threads: number,
  prefix = "Intel Core"
) => cpu("Intel", model, `${prefix} ${model}`, tier, cores, threads);

const ryzen = (model: string, tier: SeedTier, cores: number, threads: number) =>
  cpu("AMD", `Ryzen ${model}`, `AMD Ryzen ${model}`, tier, cores, threads);

const apple = (model: string, tier: SeedTier) =>
  cpu("Apple", model, `Apple ${model}`, tier);

const nvidia = (model: string, tier: SeedTier, vram?: number, suffix = "") =>
  gpu(
    "NVIDIA",
    model,
    `NVIDIA GeForce ${model}${suffix ? ` ${suffix}` : ""}`,
    tier,
    vram
  );

const radeon = (model: string, tier: SeedTier, vram?: number) =>
  gpu("AMD", model, `AMD Radeon ${model}`, tier, vram);

export const CPUS: SeedCpu[] = [
  intel("i3-8100", "low", 4, 4),
  intel("i3-8350K", "low", 4, 4),
  intel("i5-8400", "mid", 6, 6),
  intel("i5-8600K", "mid", 6, 6),
  intel("i7-8700", "high", 6, 12),
  intel("i7-8700K", "high", 6, 12),
  intel("i3-9100", "low", 4, 4),
  intel("i3-9100F", "low", 4, 4),
  intel("i5-9400F", "mid", 6, 6),
  intel("i5-9600K", "mid", 6, 6),
  intel("i7-9700K", "high", 8, 8),
  intel("i9-9900K", "enthusiast", 8, 16),
  intel("i3-10100", "low", 4, 8),
  intel("i3-10100F", "low", 4, 8),
  intel("i5-10400", "mid", 6, 12),
  intel("i5-10400F", "mid", 6, 12),
  intel("i5-10600K", "mid", 6, 12),
  intel("i7-10700", "high", 8, 16),
  intel("i7-10700K", "high", 8, 16),
  intel("i9-10900K", "enthusiast", 10, 20),
  intel("i5-11400", "mid", 6, 12),
  intel("i5-11600K", "mid", 6, 12),
  intel("i7-11700K", "high", 8, 16),
  intel("i9-11900K", "enthusiast", 8, 16),
  intel("i3-12100", "low", 4, 8),
  intel("i3-12100F", "low", 4, 8),
  intel("i5-12400", "mid", 6, 12),
  intel("i5-12400F", "mid", 6, 12),
  intel("i5-12600K", "high", 10, 16),
  intel("i7-12700", "high", 12, 20),
  intel("i7-12700K", "high", 12, 20),
  intel("i7-12700H", "high", 14, 20),
  intel("i9-12900K", "enthusiast", 16, 24),
  intel("i9-12900HK", "enthusiast", 14, 20),
  intel("i3-13100", "low", 4, 8),
  intel("i5-13400", "mid", 10, 16),
  intel("i5-13400F", "mid", 10, 16),
  intel("i5-13600K", "high", 14, 20),
  intel("i7-13700", "high", 16, 24),
  intel("i7-13700K", "high", 16, 24),
  intel("i7-13700H", "high", 14, 20),
  intel("i9-13900K", "enthusiast", 24, 32),
  intel("i9-13900HX", "enthusiast", 24, 32),
  intel("i3-14100", "low", 4, 8),
  intel("i5-14400", "mid", 10, 16),
  intel("i5-14400F", "mid", 10, 16),
  intel("i5-14600K", "high", 14, 20),
  intel("i7-14700", "high", 20, 28),
  intel("i7-14700K", "high", 20, 28),
  intel("i9-14900K", "enthusiast", 24, 32),
  intel("i5-1135G7", "mid", 4, 8),
  intel("i7-11800H", "high", 8, 16),
  intel("i7-1260P", "mid", 12, 16),
  intel("i5-8500", "mid", 6, 6),
  intel("i5-9500", "mid", 6, 6),
  intel("i7-8086K", "high", 6, 12),
  intel("i5-10500", "mid", 6, 12),
  intel("i7-10700F", "high", 8, 16),
  intel("i5-12500", "mid", 6, 12),
  intel("i7-12700F", "high", 12, 20),
  intel("i5-13500", "high", 14, 20),
  intel("i7-13700F", "high", 16, 24),
  intel("i5-14500", "high", 14, 20),
  intel("i9-14900HX", "enthusiast", 24, 32),
  intel("i7-13620H", "high", 10, 16),
  cpu("Intel", "Ultra 5 125H", "Intel Core Ultra 5 125H", "mid", 14, 18),
  cpu("Intel", "Ultra 5 125U", "Intel Core Ultra 5 125U", "mid", 12, 14),
  cpu("Intel", "Ultra 5 225H", "Intel Core Ultra 5 225H", "mid", 14, 14),
  cpu("Intel", "Ultra 7 155H", "Intel Core Ultra 7 155H", "high", 16, 22),
  cpu("Intel", "Ultra 7 155U", "Intel Core Ultra 7 155U", "high", 12, 14),
  cpu("Intel", "Ultra 7 265K", "Intel Core Ultra 7 265K", "high", 20, 20),
  cpu("Intel", "Ultra 9 185H", "Intel Core Ultra 9 185H", "enthusiast", 16, 22),
  cpu("Intel", "Ultra 9 285K", "Intel Core Ultra 9 285K", "enthusiast", 24, 24),

  ryzen("3 3100", "low", 4, 8),
  ryzen("3 3200G", "low", 4, 4),
  ryzen("5 3600", "mid", 6, 12),
  ryzen("5 3600X", "mid", 6, 12),
  ryzen("5 3400G", "low", 4, 8),
  ryzen("7 3700X", "high", 8, 16),
  ryzen("9 3900X", "enthusiast", 12, 24),
  ryzen("9 3950X", "enthusiast", 16, 32),
  ryzen("5 5500", "mid", 6, 12),
  ryzen("5 5600", "mid", 6, 12),
  ryzen("5 5600X", "mid", 6, 12),
  ryzen("5 5600G", "mid", 6, 12),
  ryzen("7 5700X", "high", 8, 16),
  ryzen("7 5700G", "high", 8, 16),
  ryzen("7 5800H", "high", 8, 16),
  ryzen("7 5800X", "high", 8, 16),
  ryzen("7 5800X3D", "enthusiast", 8, 16),
  ryzen("9 5900X", "enthusiast", 12, 24),
  ryzen("9 5950X", "enthusiast", 16, 32),
  ryzen("5 7600", "high", 6, 12),
  ryzen("5 7600X", "high", 6, 12),
  ryzen("7 7700", "high", 8, 16),
  ryzen("7 7700X", "high", 8, 16),
  ryzen("7 7735HS", "high", 8, 16),
  ryzen("7 7800X3D", "enthusiast", 8, 16),
  ryzen("9 7900X", "enthusiast", 12, 24),
  ryzen("9 7950X", "enthusiast", 16, 32),
  ryzen("9 7950X3D", "enthusiast", 16, 32),
  ryzen("5 8600G", "mid", 6, 12),
  ryzen("7 8700G", "high", 8, 16),
  ryzen("5 9600X", "high", 6, 12),
  ryzen("7 9700X", "high", 8, 16),
  ryzen("7 9800X3D", "enthusiast", 8, 16),
  ryzen("9 9900X", "enthusiast", 12, 24),
  ryzen("9 9950X", "enthusiast", 16, 32),
  ryzen("9 9950X3D", "enthusiast", 16, 32),
  ryzen("3 3300X", "low", 4, 8),
  ryzen("5 4500", "mid", 6, 12),
  ryzen("5 4600H", "mid", 6, 12),
  ryzen("7 4800H", "high", 8, 16),
  ryzen("7 5700X3D", "enthusiast", 8, 16),
  ryzen("5 7500F", "high", 6, 12),
  ryzen("7 7840HS", "high", 8, 16),
  ryzen("9 7945HX", "enthusiast", 16, 32),
  ryzen("AI 9 HX 370", "high", 12, 24),

  apple("M1", "mid"),
  apple("M1 Pro", "high"),
  apple("M1 Max", "enthusiast"),
  apple("M2", "mid"),
  apple("M2 Pro", "high"),
  apple("M2 Max", "enthusiast"),
  apple("M3", "high"),
  apple("M3 Pro", "high"),
  apple("M3 Max", "enthusiast"),
  apple("M4", "mid"),
  apple("M4 Pro", "high"),
  apple("M4 Max", "enthusiast"),
];

export const GPUS: SeedGpu[] = [
  nvidia("GTX 1050", "entry", 2048),
  nvidia("GTX 1050 Ti", "entry", 4096),
  nvidia("GTX 1060", "low", 6144),
  nvidia("GTX 1070", "low", 8192),
  nvidia("GTX 1070 Ti", "mid", 8192),
  nvidia("GTX 1080", "mid", 8192),
  nvidia("GTX 1080 Ti", "mid", 11264),
  nvidia("GTX 1650", "low", 4096),
  nvidia("GTX 1650 SUPER", "low", 4096),
  nvidia("GTX 1660", "low", 6144),
  nvidia("GTX 1660 SUPER", "low", 6144),
  nvidia("GTX 1660 Ti", "mid", 6144),
  nvidia("RTX 2060", "mid", 6144),
  nvidia("RTX 2060 SUPER", "mid", 8192),
  nvidia("RTX 2070", "mid", 8192),
  nvidia("RTX 2070 SUPER", "high", 8192),
  nvidia("RTX 2080", "high", 8192),
  nvidia("RTX 2080 SUPER", "high", 8192),
  nvidia("RTX 2080 Ti", "high", 11264),
  nvidia("RTX 3050", "low", 8192),
  nvidia("RTX 3060", "mid", 12288),
  nvidia("RTX 3060 Ti", "mid", 8192),
  nvidia("RTX 3070", "high", 8192),
  nvidia("RTX 3070 Ti", "high", 8192),
  nvidia("RTX 3080", "high", 10240),
  nvidia("RTX 3080 Ti", "enthusiast", 12288),
  nvidia("RTX 3090", "enthusiast", 24576),
  nvidia("RTX 3090 Ti", "enthusiast", 24576),
  nvidia("RTX 4050", "mid", 6144),
  nvidia("RTX 4060", "mid", 8192),
  nvidia("RTX 4060 Ti", "mid", 8192),
  nvidia("RTX 4070", "high", 12288),
  nvidia("RTX 4070 SUPER", "high", 12288),
  nvidia("RTX 4070 Ti", "high", 12288),
  nvidia("RTX 4070 Ti SUPER", "high", 16384),
  nvidia("RTX 4080", "enthusiast", 16384),
  nvidia("RTX 4080 SUPER", "enthusiast", 16384),
  nvidia("RTX 4090", "enthusiast", 24576),
  nvidia("RTX 5050", "mid", 8192),
  nvidia("RTX 5060", "mid", 8192),
  nvidia("RTX 5060 Ti", "mid", 16384),
  nvidia("RTX 5070", "high", 12288),
  nvidia("RTX 5070 Ti", "high", 16384),
  nvidia("RTX 5080", "enthusiast", 16384),
  nvidia("RTX 5090", "enthusiast", 32768),
  nvidia("RTX 3060", "mid", 6144, "Laptop"),
  nvidia("RTX 3070", "high", 8192, "Laptop"),
  nvidia("RTX 3080", "high", 8192, "Laptop"),
  nvidia("RTX 4050", "mid", 6144, "Laptop"),
  nvidia("RTX 4060", "mid", 8192, "Laptop"),
  nvidia("RTX 4070", "high", 8192, "Laptop"),
  nvidia("RTX 2050", "low", 4096, "Laptop"),
  nvidia("RTX 3050", "low", 4096, "Laptop"),
  nvidia("GTX 1650", "low", 4096, "Laptop"),
  nvidia("GTX 1660 Ti", "mid", 6144, "Laptop"),
  nvidia("RTX 4080", "enthusiast", 12288, "Laptop"),
  nvidia("RTX 4090", "enthusiast", 16384, "Laptop"),
  nvidia("RTX 5050", "mid", 8192, "Laptop"),
  nvidia("RTX 5060", "mid", 8192, "Laptop"),
  nvidia("RTX 5070", "high", 8192, "Laptop"),

  radeon("RX Vega 8", "entry"),
  radeon("RX 6400", "low", 4096),
  radeon("RX 5500", "low", 4096),
  radeon("RX 580", "low", 8192),
  radeon("RX 590", "low", 8192),
  radeon("RX 5500 XT", "low", 8192),
  radeon("RX 5600 XT", "low", 6144),
  radeon("RX 5700", "mid", 8192),
  radeon("RX 5700 XT", "mid", 8192),
  radeon("RX 6500 XT", "low", 4096),
  radeon("RX 6600", "mid", 8192),
  radeon("RX 6600 XT", "mid", 8192),
  radeon("RX 6650 XT", "mid", 8192),
  radeon("RX 6700 XT", "high", 12288),
  radeon("RX 6750 XT", "high", 12288),
  radeon("RX 6800", "high", 16384),
  radeon("RX 6800 XT", "high", 16384),
  radeon("RX 6900 XT", "enthusiast", 16384),
  radeon("RX 6950 XT", "enthusiast", 16384),
  radeon("RX 7600", "mid", 8192),
  radeon("RX 7600 XT", "mid", 16384),
  radeon("RX 7700 XT", "high", 12288),
  radeon("RX 7800 XT", "high", 16384),
  radeon("RX 7900 XT", "enthusiast", 20480),
  radeon("RX 7900 XTX", "enthusiast", 24576),
  radeon("RX 9060 XT", "mid", 16384),
  radeon("RX 9070", "high", 16384),
  radeon("RX 9070 XT", "high", 16384),
  radeon("RX 9070 XTX", "enthusiast", 24576),

  gpu("Intel", "UHD Graphics 630", "Intel UHD Graphics 630", "entry"),
  gpu("Intel", "UHD Graphics 770", "Intel UHD Graphics 770", "entry"),
  gpu("Intel", "Iris Xe Graphics", "Intel Iris Xe Graphics", "entry"),
  gpu("Intel", "Arc A380", "Intel Arc A380", "low", 6144),
  gpu("Intel", "Arc A580", "Intel Arc A580", "mid", 8192),
  gpu("Intel", "Arc A750", "Intel Arc A750", "mid", 8192),
  gpu("Intel", "Arc A770", "Intel Arc A770", "high", 16384),
  gpu("Intel", "Arc B570", "Intel Arc B570", "mid", 10240),
  gpu("Intel", "Arc B580", "Intel Arc B580", "high", 12288),
];
