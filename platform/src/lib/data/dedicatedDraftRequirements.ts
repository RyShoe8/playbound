/**
 * Developer-published client requirements for the fifteen named games in the
 * dedicated-hosting batch, reviewed 2026-10-01. Their current catalog status
 * may be Draft or Testing; these requirements are not status-gated.
 * Steam requirement text is for the base game,
 * not optional DLC or server hosting. Structured floors use a conservative
 * common floor when operating systems differ; the text calls out the
 * OS-specific figures. No install size is inferred from a
 * storefront's free-space requirement.
 * Where the developer's storage requirement is lower than the current
 * Windows depot, that discrepancy is called out in the text. Depot figures:
 * https://steamdb.info/app/240/depots/
 * https://steamdb.info/app/322330/depots/
 * https://steamdb.info/app/413150/depots/
 * https://steamdb.info/app/105600/depots/
 * https://steamdb.info/app/294100/depots/
 */
type Requirement = {
  systemRequirements: { min: string; recommended: string };
  hardwareRequirements: {
    min: Record<string, unknown>;
    recommended?: Record<string, unknown>;
    provenance: { source: "developer"; sourceUrl: string; verifiedAt: string };
  };
};

const SUPPORTED_STEAM_OS: Readonly<Record<number, ("windows" | "macos" | "linux")[]>> = {
  240: ["windows", "linux"],
  427520: ["windows", "macos", "linux"],
  1169040: ["windows", "macos", "linux"],
  322330: ["windows", "macos", "linux"],
  602960: ["windows", "macos", "linux"],
  413150: ["windows", "macos", "linux"],
  2773280: ["windows", "macos"],
  632360: ["windows"],
  211820: ["windows", "macos", "linux"],
  105600: ["windows", "macos", "linux"],
  1621690: ["windows", "linux"],
  294100: ["windows", "macos", "linux"],
  304930: ["windows", "macos", "linux"],
};

function crossPlatformSpec(id: number, spec: Record<string, unknown>): Record<string, unknown> {
  const os = SUPPORTED_STEAM_OS[id];
  if (!os) throw new Error(`No platform review for Steam app ${id}`);
  const result: Record<string, unknown> = { ...spec, os };
  if (os.length > 1) {
    // The compatibility evaluator cannot distinguish graphics APIs by OS.
    // DirectX here would falsely reject a supported Mac or Linux machine.
    delete result.apis;
  }
  return result;
}

const steam = (id: number, min: string, recommended: string,
  minSpec: Record<string, unknown>, recommendedSpec?: Record<string, unknown>): Requirement => ({
  systemRequirements: { min, recommended },
  hardwareRequirements: {
    min: crossPlatformSpec(id, minSpec),
    ...(recommendedSpec ? { recommended: crossPlatformSpec(id, recommendedSpec) } : {}),
    provenance: { source: "developer", sourceUrl: `https://store.steampowered.com/app/${id}/`, verifiedAt: "2026-10-01" },
  },
});

export const DEDICATED_DRAFT_REQUIREMENTS: Readonly<Record<string, Requirement>> = {
  "battlefield-1942-anthology": {
    systemRequirements: {
      min: "Windows 98/ME/2000/XP; Pentium III or Athlon 500 MHz; 128 MB RAM; 32 MB Direct3D GPU with hardware T&L and DirectX 8.1; 2.8 GB free. These are period requirements, not verified modern-Windows compatibility.",
      recommended: "No separate recommended specification in the Anthology manual. Modern Windows compatibility depends on the installed build and graphics support; test the actual package.",
    },
    hardwareRequirements: {
      min: { os: ["windows"], cpuText: "Pentium III or Athlon 500 MHz", ramMB: 128, gpuText: "32 MB Direct3D GPU with hardware T&L", vramMB: 32, storageMB: 2800, notes: "Period DirectX 8.1 requirement; modern compatibility not established by these figures." },
      provenance: { source: "developer", sourceUrl: "https://manuals.plus/m/ff2b1655f4e1c42703d4b446d07c34e0947b3a8f1a2c66ae34a6f25797b06eb8_optim.pdf", verifiedAt: "2026-10-01" },
    },
  },
  "counter-strike-source": steam(240,
    "Windows or Linux (current Steam clients); 1.7 GHz CPU, 512 MB RAM, DirectX 8.1-class GPU on Windows. Current Windows depot is about 4.55 GiB. Steam still displays old macOS requirements, but does not currently advertise a Mac client.",
    "Windows: Pentium 4 3.0 GHz, 1 GB RAM, DirectX 9 GPU. Linux-specific recommended requirements are not published.",
    { os: ["windows"], cpuText: "1.7 GHz processor", ramMB: 512, gpuText: "DirectX 8.1-class GPU", notes: "Steam's published Windows spec is from the original release; current OS compatibility needs testing." },
    { os: ["windows"], cpuText: "Pentium 4 3.0 GHz", ramMB: 1024, gpuText: "DirectX 9-class GPU" }),
  factorio: steam(427520,
    "Windows 10/11, macOS 10.10+, or Linux; Windows: quad-core 3 GHz, 8 GB RAM, DirectX 11 GPU with 1 GB VRAM, 5 GB free. Linux: dual-core 3 GHz and PulseAudio. Mac: 2016 Mac or newer.",
    "Windows: quad-core 4 GHz (2020+), 16 GB RAM, DirectX 11 GPU with 4 GB VRAM, 10 GB free. Mac: 2020 Apple Silicon; Linux: quad-core 3 GHz; both recommend 16 GB RAM and 10 GB free.",
    { os: ["windows"], cpuText: "Quad-core 3 GHz", ramMB: 8192, gpuText: "GTX 750 Ti / Radeon R7 360 / Intel UHD 730", vramMB: 1024, storageMB: 5000, apis: ["dx11"] },
    { os: ["windows"], cpuText: "Quad-core 4 GHz (2020+)", ramMB: 16384, gpuText: "GTX 1050 Ti / Radeon RX 570 / Intel Arc", vramMB: 4096, storageMB: 10000, apis: ["dx11"] }),
  necesse: steam(1169040,
    "Windows 10 64-bit, macOS 10.8+ on Intel, or 64-bit Linux; Core i3-4160 / FX-4350, 4 GB RAM, GT 440 / HD 6570 with 1 GB VRAM. Store says 500 MB free; current Windows depot is larger. Apple Silicon is not supported by the Mac build.",
    "Core i5-4590 / Ryzen 3 2200G, 8 GB RAM, GTX 650 / HD 7750 with 2 GB VRAM. Mac and Linux list comparable CPU, RAM, and graphics floors.",
    { os: ["windows"], arch: ["x64"], cpuText: "Core i3-4160 / FX-4350", ramMB: 4096, gpuText: "GT 440 / Radeon HD 6570", vramMB: 1024, notes: "Store lists 500 MB free; actual current Windows depot exceeds that." },
    { os: ["windows"], arch: ["x64"], cpuText: "Core i5-4590 / Ryzen 3 2200G", ramMB: 8192, gpuText: "GTX 650 / Radeon HD 7750", vramMB: 2048 }),
  "dont-starve-together": steam(322330,
    "Windows, macOS, or Linux; Windows/Linux: 1.7 GHz CPU, 1 GB RAM, Radeon HD 5450-class GPU with 256 MB VRAM. Mac: 2 GHz Intel CPU and 4 GB RAM. Steam says 3 GB free, but its current Windows depot is about 4.11 GiB; allow more space.",
    "No separate recommended client specification published by the developer. Check current client/OS support before buying for an older Mac or Linux distribution.",
    { os: ["windows"], cpuText: "1.7 GHz processor", ramMB: 4096, gpuText: "Radeon HD 5450 or better", vramMB: 256, apis: ["dx9"], notes: "Windows/Linux minimum is 1 GB RAM; Mac minimum is 4 GB. Store's 3 GB storage requirement is below the current Windows depot; allow over 4.11 GiB." }),
  barotrauma: steam(602960,
    "Windows 64-bit, macOS 10.15+, or Ubuntu 18.04+; dual-core 2.4 GHz, 4 GB RAM, 2 GB graphics memory, 2 GB free. Windows requires DirectX 11; Mac/Linux require OpenGL 3.0+.",
    "Quad-core 3 GHz, 8 GB RAM, GTX 950 / Radeon R9 370 with 2 GB VRAM, 2 GB free; broadband for multiplayer. The published Mac/Linux recommendations are comparable.",
    { os: ["windows"], cpuText: "Dual-core 2.4 GHz", ramMB: 4096, gpuText: "Shader Model 2.0+ GPU", vramMB: 2048, storageMB: 2000, apis: ["dx11"] },
    { os: ["windows"], cpuText: "Quad-core 3 GHz", ramMB: 8192, gpuText: "GTX 950 / Radeon R9 370", vramMB: 2048, storageMB: 2000, apis: ["dx11"] }),
  "stardew-valley": steam(413150,
    "Windows, macOS 10.10+, or Ubuntu Linux; 2 GHz CPU, 2 GB RAM, GPU with 256 MB video memory. Windows requires DirectX 10; Mac/Linux require OpenGL 2. Steam says 500 MB free, but its current Windows depot is about 660 MiB.",
    "The developer does not publish a separate recommended client specification. Allow extra disk space for saves and optional mods.",
    { os: ["windows"], cpuText: "2 GHz processor", ramMB: 2048, gpuText: "Shader Model 3.0+ GPU", vramMB: 256, apis: ["dx10"], notes: "Current Windows depot exceeds the store's 500 MB storage requirement." }),
  "aneurism-iv": steam(2773280,
    "Windows 10: Core i5-7400 3 GHz, 8 GB RAM, GTX 1050, DirectX 11, 2 GB free. macOS Big Sur 11+: Apple M1 with 10-core GPU, 8 GB RAM, 2 GB free. Broadband required.",
    "No separate recommended specification is published for either platform.",
    { os: ["windows"], cpuText: "Core i5-7400 3 GHz", ramMB: 8192, gpuText: "GTX 1050", storageMB: 2000, apis: ["dx11"] }),
  "risk-of-rain-2": steam(632360,
    "Windows 64-bit; Core i3-6100 / FX-8350, 4 GB RAM, GTX 580 / Radeon HD 7870, DirectX 11, 4 GB free; broadband for online play.",
    "Windows 64-bit; Core i5-4670K / Ryzen 5 1500X, 4 GB RAM, GTX 680 / Radeon HD 7970, DirectX 11, 4 GB free.",
    { os: ["windows"], arch: ["x64"], cpuText: "Core i3-6100 / FX-8350", ramMB: 4096, gpuText: "GTX 580 / Radeon HD 7870", storageMB: 4000, apis: ["dx11"] },
    { os: ["windows"], arch: ["x64"], cpuText: "Core i5-4670K / Ryzen 5 1500X", ramMB: 4096, gpuText: "GTX 680 / Radeon HD 7970", storageMB: 4000, apis: ["dx11"] }),
  starbound: steam(211820,
    "Windows, macOS (Intel), or Linux; Core 2 Duo, 2 GB RAM, 256 MB graphics memory, 3 GB free. Windows requires DirectX 9.0c; Linux requires OpenGL 2.1. Mac store minimum is OS X 10.9 with a 64-bit Intel CPU.",
    "Core i3, 4 GB RAM, discrete GPU, 4 GB free. Steam lists the same memory and storage for Mac and Linux; Linux requires OpenGL 2.1.",
    { os: ["windows"], cpuText: "Core 2 Duo", ramMB: 2048, gpuText: "DirectX 9.0c GPU", vramMB: 256, storageMB: 3000, apis: ["dx9"] },
    { os: ["windows"], cpuText: "Core i3", ramMB: 4096, gpuText: "Discrete DirectX 9.0c GPU", storageMB: 4000, apis: ["dx9"] }),
  terraria: steam(105600,
    "Windows, macOS, or Linux; 2 GHz CPU, 2.5 GB RAM, 128 MB shader-capable GPU. Windows requires DirectX 9.0c; Mac/Linux require OpenGL 3.0 (or 2.1 with ARB extensions). Steam says 200 MB free, but its current Windows depot is about 767 MiB.",
    "Dual-core 3 GHz, 4 GB RAM, 256 MB shader-capable GPU, 200 MB free. The developer lists comparable recommended figures for Windows, Mac, and Linux.",
    { os: ["windows"], cpuText: "2 GHz processor", ramMB: 2560, gpuText: "Shader Model 2.0+ GPU", vramMB: 128, apis: ["dx9"], notes: "Current Windows depot exceeds the store's 200 MB storage requirement." },
    { os: ["windows"], cpuText: "Dual-core 3 GHz", ramMB: 4096, gpuText: "Shader Model 2.0+ GPU", vramMB: 256, apis: ["dx9"] }),
  "vintage-story": {
    systemRequirements: {
      min: "Windows 10+, macOS 13+, or Linux, 64-bit; 2nd-gen Core i3/i5 (2 threads), 8 GB RAM, GT 440 / Intel HD 620-class graphics with OpenGL 3.3, 3 GB free. Linux and Mac need .NET 10 runtime; Linux client needs GLIBC 2.34+.",
      recommended: "Ryzen or 4th-gen Core i5/i7 (2 cores/4 threads), 16 GB RAM, GT 1030 / RX 560-class GPU, OpenGL 3.3, 6 GB free on SSD; around 30 FPS at medium settings without heavy mods.",
    },
    hardwareRequirements: {
      min: { os: ["windows", "macos", "linux"], cpuText: "2nd-gen Core i3/i5, 2 threads", ramMB: 8192, gpuText: "GT 440 / Intel HD 620", storageMB: 3000, apis: ["opengl"], notes: "macOS 13+; Linux client requires GLIBC 2.34+ and .NET 10 runtime. Windows ARM is unsupported." },
      recommended: { os: ["windows", "macos", "linux"], cpuText: "Ryzen or 4th-gen Core i5/i7, 2 cores / 4 threads", ramMB: 16384, gpuText: "GT 1030 / Radeon RX 560", storageMB: 6000, apis: ["opengl"] },
      provenance: { source: "developer", sourceUrl: "https://www.vintagestory.at/sysrequirements/", verifiedAt: "2026-10-01" },
    },
  },
  "core-keeper": steam(1621690,
    "Windows 10 64-bit or Ubuntu 20.04+; Core i5-2300 / Ryzen 3 1200, 8 GB RAM on Windows, GTX 460 / Radeon HD 5850. Steam's Linux listing omits a RAM number; no official storage figure is listed.",
    "Windows: Core i5-8400 / Ryzen 7 2700X, 8 GB RAM, GTX 1050 Ti / Radeon R9 280X. Linux: Ubuntu 22.04+, same listed CPU/GPU; no RAM or storage number published for Linux.",
    { os: ["windows"], arch: ["x64"], cpuText: "Core i5-2300 / Ryzen 3 1200", ramMB: 8192, gpuText: "GTX 460 / Radeon HD 5850" },
    { os: ["windows"], arch: ["x64"], cpuText: "Core i5-8400 / Ryzen 7 2700X", ramMB: 8192, gpuText: "GTX 1050 Ti / Radeon R9 280X" }),
  rimworld: steam(294100,
    "Windows, macOS 10.12+, or Linux; Core 2 Duo, 4 GB RAM, Intel HD 4000 / Shader Model 4.0-class GPU. Store says 1 GB free, but its current Windows depot is about 1.07 GiB; DLC and mods need more.",
    "No separate recommended client specification is published. Large colonies and mods can need considerably more memory and CPU than the minimum.",
    { os: ["windows", "macos", "linux"], cpuText: "Core 2 Duo", ramMB: 4096, gpuText: "Intel HD Graphics 4000 / Shader Model 4.0", notes: "Current Windows depot exceeds the store's 1 GB storage requirement." }),
  unturned: steam(304930,
    "Windows, macOS, or Linux; 3 GHz CPU, 8 GB RAM, 4 GB free. Windows requires DirectX 10. Mac minimum is High Sierra; Linux minimum is Ubuntu 16.04+.",
    "4 GHz CPU, 16 GB RAM, 6 GB free; broadband for multiplayer. Developer recommends Windows 10 64-bit, macOS Big Sur, or Ubuntu 20.04+.",
    { os: ["windows"], cpuText: "3 GHz processor", ramMB: 8192, storageMB: 4000, apis: ["dx10"] },
    { os: ["windows"], cpuText: "4 GHz processor", ramMB: 16384, storageMB: 6000, apis: ["dx11"] }),
};

export function dedicatedDraftRequirementsFor(slug: string): Requirement | undefined {
  return DEDICATED_DRAFT_REQUIREMENTS[slug];
}
