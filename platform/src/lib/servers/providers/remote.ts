import type { GameServer } from "../types";
import { attachGeo } from "../geo";
import { MAX_SERVERS } from "../types";

export type RemoteMasterAuth = {
  username: string;
  password: string;
};

/** Set on the empty array the adapter returns when its own poll failed. */
const ADAPTER_FAILED = Symbol("playbound.adapterPollFailed");

const adapterErrorsLogged = new Set<string>();

/** HTTP headers are Latin-1; prefix so the adapter can restore UTF-8 passwords. */
function encodeLobbyHeader(value: string): string {
  return `b64:${Buffer.from(value, "utf8").toString("base64")}`;
}

function logAdapterErrorOnce(slug: string, error: string) {
  const key = `${slug}:${error}`;
  if (adapterErrorsLogged.has(key)) return;
  adapterErrorsLogged.add(key);
  console.warn(`[servers] ${slug} adapter: ${error}`);
}

/**
 * Fetch a UDP-backed list from the always-on Master Adapter (Render).
 * Optional lobby auth is forwarded for Zero-K / 0 A.D. / Wesnoth battle lists.
 */
/**
 * Prefer the Master Adapter, fall back to fetching the upstream directly.
 *
 * For sources that block Vercel but not the adapter. swglegends.com sits behind
 * Cloudflare and answers 403 to our production requests while returning 200 to
 * the same headers from an ordinary network, so it is the request's origin
 * being refused rather than its shape — nothing we can send fixes it, but a
 * proxy with a different address can.
 *
 * Ordered adapter-first because the direct path is the known-broken one. If the
 * adapter has no endpoint for the slug yet this costs one fast 404 before
 * falling back to exactly today's behaviour, and it starts working the moment
 * that endpoint exists without another deploy here.
 */
export async function fetchViaAdapterOrDirect(
  slug: string,
  direct: () => Promise<GameServer[]>
): Promise<GameServer[]> {
  try {
    const viaAdapter = await fetchRemoteMaster(slug);
    // A failed poll comes back as 200 with an error and no servers, so an
    // empty list alone cannot be trusted to mean "nobody is playing".
    if (!(ADAPTER_FAILED in viaAdapter)) return viaAdapter;
  } catch (err) {
    logAdapterErrorOnce(slug, err instanceof Error ? err.message : String(err));
  }
  return direct();
}

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
    headers["x-playbound-lobby-user"] = encodeLobbyHeader(auth.username);
    headers["x-playbound-lobby-pass"] = encodeLobbyHeader(auth.password);
  }

  const res = await fetch(`${base}/v1/${slug}/servers`, {
    headers,
    signal: AbortSignal.timeout(auth ? 18_000 : 15_000),
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
    logAdapterErrorOnce(slug, data.error);
    /*
     * Empty, but not silently. The adapter reports a failed poll as HTTP 200
     * with an error field and no servers, so returning [] here looks like a
     * success to every caller — which is how a broken SWG scrape surfaced as
     * "no servers online" rather than as a failure, and why the direct
     * fallback below never ran. The marker lets fetchViaAdapterOrDirect tell
     * the two apart; every other caller still gets a plain empty list.
     */
    return Object.assign([] as GameServer[], { [ADAPTER_FAILED]: data.error });
  }

  const servers = Array.isArray(data.servers) ? data.servers.slice(0, MAX_SERVERS) : [];
  return attachGeo(servers);
}
