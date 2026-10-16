/** Wire units are integers; no caller selects cgroup properties or task/swap policy. */
export function customerResourceLimits(game, input) {
  if (!["teeworlds", "bzflag", "hedgewars", "openttd", "luanti", "openarena", "battle-for-wesnoth", "supertuxkart", "0-ad", "ysoccer"].includes(game)) throw new Error("Unsupported resource profile");
  if (input === undefined) return { cpuMillis: ["luanti","0-ad"].includes(game) ? 2000 : 1000, memoryMiB: ["luanti","0-ad"].includes(game) ? 2048 : 1024 };
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["cpuMillis", "memoryMiB"].includes(key)) ||
      !Number.isInteger(input.cpuMillis) || input.cpuMillis < 250 || input.cpuMillis > 6000 ||
      !Number.isInteger(input.memoryMiB) || input.memoryMiB < 256 || input.memoryMiB > 8192) throw new Error("Customer allocation must be 0.25–6 CPU cores and 256–8192 MiB RAM");
  return { cpuMillis: input.cpuMillis, memoryMiB: input.memoryMiB };
}
