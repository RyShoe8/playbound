import type { GameServer } from "../types";
import { attachGeo } from "../geo";
import { MAX_SERVERS } from "../types";

export type RemoteMasterAuth = {
  username: string;
  password: string;
};

/**
 * Fetch a UDP-backed list from the always-on Master Adapter (Render).
 * Optional lobby auth is forwarded for Zero-K / 0 A.D. battle lists.
 */
export async function fetchRemoteMaster(
  slug: string,
  auth?: RemoteMasterAuth | null
): Promise<GameServer[]> {
  const base = process.env.MASTER_ADAPTER_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("MASTER_ADAPTER_URL is not configured");
  }
  try {
    new URL(base);
  } catch {
    throw new Error("MASTER_ADAPTER_URL is not a valid URL");
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "PlayBound/1.0",
  };
  if (process.env.MASTER_ADAPTER_KEY) {
    headers["x-playbound-adapter-key"] = process.env.MASTER_ADAPTER_KEY;
  }
  if (auth?.username && auth?.password) {
    headers["x-playbound-lobby-user"] = auth.username;
    headers["x-playbound-lobby-pass"] = auth.password;
  }

  const res = await fetch(`${base}/v1/${slug}/servers`, {
    headers,
    signal: AbortSignal.timeout(auth ? 18_000 : 8_000),
    ...(auth ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
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
