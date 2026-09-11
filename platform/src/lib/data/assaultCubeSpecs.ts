/**
 * Official AssaultCube minimums from assault.cubers.net getstarted docs.
 * Recommended is a light modern bump — the project only publishes a minimum.
 */
export const ASSAULTCUBE_SLUG = "assaultcube" as const;

export const assaultCubeSystemRequirements = {
  min: "Intel Pentium III or AMD K7 · 192 MB RAM · NVIDIA GeForce 256 or ATI Radeon R7000 · 50 MB storage",
  recommended: "1 GHz CPU · 512 MB RAM · Any OpenGL GPU · 100 MB storage",
} as const;

export const assaultCubeHardwareRequirements = {
  min: {
    ramMB: 192,
    storageMB: 50,
    cpuText: "Intel Pentium III or AMD K7",
    gpuText: "NVIDIA GeForce 256 or ATI Radeon R7000",
  },
  recommended: {
    ramMB: 512,
    storageMB: 100,
    cpuText: "1 GHz CPU",
    gpuText: "Any OpenGL GPU",
  },
  provenance: {
    source: "playbound_verified" as const,
    enteredBy: "admin" as const,
  },
};
