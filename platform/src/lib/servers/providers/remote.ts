import type { GameServer } from "../types";
import { attachGeo } from "../geo";
import { MAX_SERVERS } from "../types";

/**
 * Fetch a UDP-backed list from the always-on Master Adapter (Render).
 */
export async function fetchRemoteMaster(slug: string): Promise<GameServer[]> {
  const base = process.env.MASTER_ADAPTER_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("MASTER_ADAPTER_URL is not configured");
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "PlayBound/1.0",
  };
  if (process.env.MASTER_ADAPTER_KEY) {
    headers["x-playbound-adapter-key"] = process.env.MASTER_ADAPTER_KEY;
  }

  const res = await fetch(`${base}/v1/${slug}/servers`, {
    headers,
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`Master adapter returned ${res.status} for ${slug}`);
  }

  const data = (await res.json()) as {
    servers?: GameServer[];
    error?: string;
  };

  if (data.error && (!data.servers || data.servers.length === 0)) {
    throw new Error(data.error);
  }

  const servers = Array.isArray(data.servers) ? data.servers.slice(0, MAX_SERVERS) : [];
  return attachGeo(servers);
}
