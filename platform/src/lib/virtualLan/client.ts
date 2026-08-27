/**
 * NetBird management client — the overlay behind PlayBound Connect's
 * virtual-LAN mode, self-hosted on the PlayBound VPS.
 *
 * A party maps onto three NetBird objects:
 *
 *   group   — the party's peers, and nothing else
 *   policy  — group talks to group, bidirectionally; no other peer can reach in
 *   key     — an ephemeral, usage-limited setup key that enrolls a machine
 *             straight into that group
 *
 * Ephemeral peers is the important flag: NetBird removes them on its own once
 * they go offline, so a party that ends badly cannot leave machines enrolled
 * on a segment forever.
 *
 * Self-hosted, so the base URL is ours. NETBIRD_API_URL points at the
 * management API (e.g. https://netbird.playbound.club/api) and
 * NETBIRD_API_TOKEN is a service-user personal access token.
 */

export type NetBirdParty = {
  groupId: string;
  policyId: string;
  setupKeyId: string;
  setupKey: string;
};

function apiBase(): string | null {
  const raw = process.env.NETBIRD_API_URL;
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function apiToken(): string | null {
  return process.env.NETBIRD_API_TOKEN || null;
}

/**
 * Group holding the VPS discovery reflector.
 *
 * A LAN game's peers find each other by broadcasting, and WireGuard routes
 * rather than replicates, so the reflector has to sit inside every party's
 * policy to receive that broadcast and pass it on. Optional: without it the
 * segment still forms and unicast still works, only discovery does not.
 */
function infraGroupId(): string | null {
  return process.env.NETBIRD_INFRA_GROUP_ID || null;
}

export function isVirtualLanConfigured(): boolean {
  return Boolean(apiBase() && apiToken());
}

/** The management URL the launcher enrolls against, without the /api suffix. */
export function managementUrl(): string | null {
  const base = apiBase();
  if (!base) return null;
  return base.replace(/\/api$/, "");
}

async function nb<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const base = apiBase();
  const token = apiToken();
  if (!base || !token) return { ok: false, error: "Virtual LAN is not configured" };

  try {
    const res = await fetch(`${base}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Never let a slow overlay API hold up a party launch.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.text();
        if (body) {
          const parsed = JSON.parse(body);
          detail = parsed.message || parsed.error || body.slice(0, 100);
        }
      } catch {
        /* ignore parse */
      }
      return { ok: false, error: detail ? `NetBird ${res.status}: ${detail}` : `NetBird ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { ok: false, error: `NetBird request failed: ${message}` };
  }
}

/** Setup keys must live at least a day per the API; parties never do. */
const KEY_LIFETIME_SECONDS = 86_400;

/**
 * Stand up a party's segment.
 *
 * Rolls back on partial failure. A group with no policy is harmless but
 * invisible, and a key with no policy enrolls machines that cannot talk to
 * each other — both look like "the network is broken" to a player, so a
 * half-built party is torn down rather than handed out.
 */
export async function createPartyNetwork(opts: {
  partyId: string;
  name: string;
  maxPeers: number;
}): Promise<NetBirdParty | { error: string }> {
  const label = `playbound-party-${opts.partyId}`;

  const group = await nb<{ id?: string }>("/groups", {
    method: "POST",
    body: { name: label },
  });
  if (!group.ok) return { error: group.error };
  const groupId = group.data.id;
  if (!groupId) return { error: "NetBird did not return a group id" };

  // The reflector must be inside the party's policy or it never sees the
  // discovery traffic it exists to forward.
  const infra = infraGroupId();
  const members = infra ? [groupId, infra] : [groupId];

  const policy = await nb<{ id?: string }>("/policies", {
    method: "POST",
    body: {
      name: label,
      description: `PlayBound party ${opts.partyId}`,
      enabled: true,
      rules: [
        {
          name: label,
          enabled: true,
          // Games here use arbitrary ports, and the group is one party, so
          // the isolation that matters is the group boundary, not the ports.
          action: "accept",
          bidirectional: true,
          protocol: "all",
          sources: members,
          destinations: members,
        },
      ],
    },
  });
  if (!policy.ok) {
    await deleteGroup(groupId);
    return { error: policy.error };
  }
  const policyId = policy.data.id;
  if (!policyId) {
    await deleteGroup(groupId);
    return { error: "NetBird did not return a policy id" };
  }

  const key = await nb<{ id?: string; key?: string }>("/setup-keys", {
    method: "POST",
    body: {
      name: label,
      type: "reusable",
      expires_in: KEY_LIFETIME_SECONDS,
      auto_groups: [groupId],
      // One enrollment per member, with headroom for a reinstall.
      usage_limit: Math.max(2, opts.maxPeers) * 2,
      ephemeral: true,
    },
  });
  if (!key.ok || !key.data.id || !key.data.key) {
    await deletePolicy(policyId);
    await deleteGroup(groupId);
    return { error: key.ok ? "NetBird did not return a setup key" : key.error };
  }

  return {
    groupId,
    policyId,
    setupKeyId: key.data.id,
    setupKey: key.data.key,
  };
}

async function deleteGroup(groupId: string): Promise<void> {
  await nb(`/groups/${groupId}`, { method: "DELETE" });
}

async function deletePolicy(policyId: string): Promise<void> {
  await nb(`/policies/${policyId}`, { method: "DELETE" });
}

/**
 * Tear a party's segment down.
 *
 * Order matters: the policy references the group, and the key auto-assigns to
 * it, so both have to go before NetBird will drop the group.
 */
export async function deletePartyNetwork(net: Partial<NetBirdParty>): Promise<void> {
  if (net.policyId) await deletePolicy(net.policyId);
  if (net.setupKeyId) await nb(`/setup-keys/${net.setupKeyId}`, { method: "DELETE" });
  if (net.groupId) await deleteGroup(net.groupId);
}

/**
 * Overlay IPs of the machines currently on a party's segment.
 *
 * Peers carry the group inline, so this is one call and a filter rather than
 * a lookup per member.
 */
export async function listPartyPeerIps(groupId: string): Promise<string[]> {
  const res = await nb<
    Array<{ ip?: string; connected?: boolean; groups?: Array<{ id?: string }> }>
  >("/peers");
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data
    .filter((p) => (p.groups || []).some((g) => g.id === groupId))
    .map((p) => p.ip || "")
    .filter(Boolean);
}
