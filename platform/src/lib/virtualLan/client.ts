/**
 * ZeroTier Central client — the L2 overlay behind PlayBound Connect's
 * virtual-LAN mode.
 *
 * ZeroTier rather than WireGuard/Tailscale because the games that need this
 * find each other with broadcast discovery, and only an L2 overlay carries
 * broadcast. See `requiresBroadcast` in the multiplayer adapters.
 *
 * Networks are ephemeral and per-party: created on Join Game, deleted when the
 * party ends. Members are private — a node joins and sits unauthorized until
 * the party confirms it belongs, so knowing a network ID is not enough to get
 * onto someone's segment.
 */

const API_BASE = "https://api.zerotier.com/api/v1";

export type ZtNetwork = {
  networkId: string;
  name: string;
};

function apiToken(): string | null {
  return process.env.ZEROTIER_API_TOKEN || null;
}

export function isVirtualLanConfigured(): boolean {
  return Boolean(apiToken());
}

async function zt<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = apiToken();
  if (!token) return { ok: false, error: "Virtual LAN is not configured" };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Never let a slow overlay API hold up a party launch.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, error: `ZeroTier ${res.status}` };
    }
    // DELETE returns an empty body.
    const text = await res.text();
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `ZeroTier request failed: ${message}` };
  }
}

/**
 * Create a private network for one party.
 *
 * The 10.147.x range is ZeroTier's own managed space and does not collide with
 * the 192.168/10.0 ranges home routers hand out, so a player's real LAN keeps
 * working while they are on the overlay.
 */
export async function createLanNetwork(opts: {
  name: string;
  partyId: string;
}): Promise<{ networkId: string } | { error: string }> {
  const res = await zt<{ id?: string; config?: { id?: string } }>("/network", {
    method: "POST",
    body: {
      config: {
        name: opts.name.slice(0, 64),
        private: true,
        enableBroadcast: true,
        v4AssignMode: { zt: true },
        ipAssignmentPools: [
          { ipRangeStart: "10.147.20.1", ipRangeEnd: "10.147.20.254" },
        ],
        routes: [{ target: "10.147.20.0/24", via: null }],
        // Permissive inside the segment: the games here use arbitrary ports
        // and the network is private and party-scoped anyway.
        rules: [{ type: "ACTION_ACCEPT" }],
      },
      description: `PlayBound party ${opts.partyId}`,
    },
  });
  if (!res.ok) return { error: res.error };

  const networkId = res.data.id || res.data.config?.id;
  if (!networkId) return { error: "ZeroTier did not return a network id" };
  return { networkId };
}

/** Let one node onto the segment. Idempotent. */
export async function authorizeLanMember(
  networkId: string,
  nodeId: string
): Promise<{ ok: true } | { error: string }> {
  const res = await zt(`/network/${networkId}/member/${nodeId}`, {
    method: "POST",
    body: { config: { authorized: true } },
  });
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function deauthorizeLanMember(
  networkId: string,
  nodeId: string
): Promise<void> {
  await zt(`/network/${networkId}/member/${nodeId}`, {
    method: "POST",
    body: { config: { authorized: false } },
  });
}

export async function deleteLanNetwork(networkId: string): Promise<void> {
  await zt(`/network/${networkId}`, { method: "DELETE" });
}

/** ZeroTier node IDs are exactly 10 lowercase hex digits. */
export function isValidNodeId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{10}$/.test(value);
}

/** Network IDs are 16 lowercase hex digits. */
export function isValidNetworkId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}
