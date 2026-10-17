/** Isolation takes precedence over engine-specific console/network launchers. */
export function runtimeLaunchMode({ isolated, communityServerId, gameSlug }) {
  if (isolated) {
    if (!/^[a-f0-9]{24}$/i.test(communityServerId || "")) throw new Error("Isolated launch requires a managed server identity");
    return "isolated";
  }
  if (gameSlug === "aneurism-iv") return "aniv";
  if (gameSlug === "rimworld-together") return "rimworld";
  return "standard";
}
