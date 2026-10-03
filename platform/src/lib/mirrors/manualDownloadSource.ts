export type ManualDownloadSource = "playbound_vps" | "r2" | "public";

/** Classify the file host, not the site the visitor came from. */
export function manualDownloadSource(url: string, r2CustomDomain?: string | null): ManualDownloadSource {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "mirror.playbound.club") return "playbound_vps";
    if (host === "r2.playbound.club") return "r2";
    let customR2Host: string | null = null;
    if (r2CustomDomain) {
      try {
        const normalized = /^https?:\/\//i.test(r2CustomDomain) ? r2CustomDomain : `https://${r2CustomDomain}`;
        customR2Host = new URL(normalized).hostname.toLowerCase();
      } catch {
        // A bad optional config must not affect the known PlayBound hosts.
      }
    }
    if (customR2Host && host === customR2Host) return "r2";
    return "public";
  } catch {
    return "public";
  }
}
