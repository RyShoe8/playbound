/** Exact game-package keys referenced by live catalog install recipes. */
export function mirrorArchiveKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      try {
        const url = new URL(item);
        if (url.origin !== "https://mirror.playbound.club") return;
        const key = decodeURIComponent(url.pathname.slice(1));
        if ((key.startsWith("games/") || key.startsWith("launcher-packages/")) &&
            !key.split("/").some((part) => !part || part === "." || part === "..") &&
            !key.includes("\\")) keys.add(key);
      } catch { /* Not a URL. */ }
    } else if (Array.isArray(item)) {
      item.forEach(visit);
    } else if (item && typeof item === "object") {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return [...keys];
}
