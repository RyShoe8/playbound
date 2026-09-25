/** How a party reaches its game: public servers, the dedicated room and virtual LAN, and provisioning them. */
import { after } from "next/server";
import { type PartyPayload } from "@/lib/playTogether/types";
import { provisionPartyHost, reconcilePartyHostAlive } from "@/lib/gameHost/provision";
import { provisionPartyLan, partyLanNeedsProvision } from "@/lib/virtualLan/provision";
import { isHostableGame, type HostedStatus } from "@/lib/gameHost/catalog";
import { getMultiplayerAdapter, isVirtualLanGame } from "@/lib/multiplayer/adapters";
import { isDiscoveryReflectorConfigured, isVirtualLanConfigured } from "@/lib/virtualLan/client";
import { resolvedHostMode } from "@/lib/multiplayer/hostModes";
import { readySummary } from "@/lib/playTogether/partyRules";
import { PartyDoc, PublicServerFields } from "./types";

export function serializePublicServer(
  server: PublicServerFields | null | undefined
): PartyPayload["publicServer"] {
  if (!server?.host || !server?.port) return null;
  return {
    id: server.id || null,
    name: server.name || null,
    host: server.host,
    port: server.port,
    mod: server.mod || null,
    protected: Boolean(server.protected),
  };
}

export function parsePublicServer(raw: unknown): PublicServerFields | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Pick a public server to play on." };
  }
  const o = raw as Record<string, unknown>;
  const host = typeof o.host === "string" ? o.host.trim() : "";
  const port = typeof o.port === "number" ? o.port : Number(o.port);
  if (!host || host.length > 253 || /\s/.test(host) || /[/\\]/.test(host)) {
    return { error: "That server address is not valid." };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "That server port is not valid." };
  }
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  const id = typeof o.id === "string" ? o.id.trim().slice(0, 200) : "";
  const mod = typeof o.mod === "string" ? o.mod.trim().slice(0, 40) : "";
  return {
    id: id || `${host}:${port}`,
    name: name || `${host}:${port}`,
    host,
    port,
    mod: mod || null,
    protected: Boolean(o.protected),
  };
}

export function resetPartyConnectState(doc: PartyDoc) {
  doc.selfHostReady = false;
  doc.selfHostReadyAt = null;
  if (doc.hosted) {
    doc.hosted.status = "none";
    doc.hosted.error = null;
    doc.hosted.host = null;
    doc.hosted.port = null;
    doc.hosted.roomId = null;
    doc.hosted.name = null;
    doc.hosted.roomCode = null;
  }
  if (doc.couch) {
    doc.couch.status = "none";
    doc.couch.joinCode = null;
    doc.couch.joinUrl = null;
    doc.couch.error = null;
    doc.couch.startedAt = null;
  }
  if (doc.lan) {
    doc.lan.status = "none";
    doc.lan.error = null;
    doc.lan.pendingAt = null;
    doc.lan.groupId = undefined;
    doc.lan.policyId = undefined;
    doc.lan.setupKeyId = undefined;
    doc.lan.setupKey = undefined;
  }
  doc.publicServer = {
    id: null,
    name: null,
    host: null,
    port: null,
    mod: null,
    protected: false,
  };
}

function partyConnectCanAutoProvision(doc: PartyDoc): boolean {
  const { allReady: allReadyUp } = readySummary(doc.members);
  const soloReady = doc.members.length === 1 && Boolean(doc.members[0]?.ready);
  if (!allReadyUp && !soloReady) return false;
  if (doc.status === "ended" || doc.status === "launching" || doc.status === "playing") {
    return false;
  }
  return true;
}

/** Which connections a party is due to have provisioned right now. */
function pendingPartyConnect(doc: PartyDoc): { host: boolean; lan: boolean } {
  const none = { host: false, lan: false };
  if (!doc.gameSlug || !partyConnectCanAutoProvision(doc)) return none;
  const slug = String(doc.gameSlug);
  const hostMode = resolvedHostMode(slug, doc.hostMode, doc.hosted);
  // Public servers need nothing. Couch parties have no room and no overlay —
  // the session is started by the leader's launcher at Start Game.
  if (hostMode === "public" || hostMode === "couch") return none;
  const hs = (doc.hosted?.status || "none") as HostedStatus;
  return {
    host: hostMode === "dedicated" && isHostableGame(slug) && (hs === "none" || hs === "failed"),
    // A LAN already "pending" is in flight and left alone until stale.
    lan: (isVirtualLanGame(slug) || hostMode === "self") && partyLanNeedsProvision(doc.lan),
  };
}

async function maybeProvisionPartyConnect(doc: PartyDoc): Promise<void> {
  const due = pendingPartyConnect(doc);
  if (due.host) await provisionPartyHost(doc);
  if (due.lan) await provisionPartyLan(doc);
}

/**
 * Provision a party's server/LAN after the response is sent.
 *
 * Starting a room can take minutes (the VPS may download the game first), and
 * this used to run inside the Ready / host-mode / world click, so the button
 * sat disabled until the server was up. The click now answers at once; the
 * party reports "pending" and the next poll shows the room arriving.
 *
 * Returns the payload object with the due connections marked pending so the
 * immediate response already shows "Starting server…" rather than nothing.
 * Outside a request (scripts, tests) `after` is unavailable and the work
 * simply runs detached.
 */
export function provisionPartyConnectInBackground<T extends Record<string, unknown>>(doc: PartyDoc, payloadDoc: T): T {
  const due = pendingPartyConnect(doc);
  if (!due.host && !due.lan) return payloadDoc;
  const partyId = String(doc._id);
  const task = () =>
    maybeProvisionPartyConnect(doc).catch((err) => {
      console.warn(`[party] background provision failed for ${partyId}:`, err instanceof Error ? err.message : err);
    });
  try {
    after(task);
  } catch {
    void task();
  }
  const marked = { ...payloadDoc } as Record<string, unknown>;
  if (due.host) marked.hosted = { ...((payloadDoc.hosted as object) || {}), status: "pending", error: null };
  if (due.lan) marked.lan = { ...((payloadDoc.lan as object) || {}), status: "pending" };
  return marked as T;
}

export async function ensurePartyConnectReady(
  doc: PartyDoc
): Promise<{ ok: true } | { error: string }> {
  const slug = String(doc.gameSlug || "");
  const hostMode = resolvedHostMode(slug, doc.hostMode, doc.hosted);

  // Nothing to reach in couch mode — the game runs on the leader's PC and the
  // party arrives as controllers, not as clients.
  if (hostMode === "couch") return { ok: true };

  if (hostMode === "public") {
    if (!doc.publicServer?.host || !doc.publicServer?.port) {
      return { error: "Pick a public server to play on." };
    }
    return { ok: true };
  }

  if (hostMode === "dedicated" && isHostableGame(slug)) {
    await reconcilePartyHostAlive(doc);
    let hs = (doc.hosted?.status || "none") as HostedStatus;
    if (hs === "ready" && doc.hosted?.host && doc.hosted?.port) {
      /* ready */
    } else if (hs === "pending") {
      return { error: "Server is still starting — wait a moment" };
    } else {
      if (hs === "failed" || hs === "none") {
        await provisionPartyHost(doc);
      }
      hs = (doc.hosted?.status || "none") as HostedStatus;
      if (hs === "pending") {
        return { error: "Server is still starting — wait a moment" };
      }
      if (hs !== "ready" || !doc.hosted?.host || !doc.hosted?.port) {
        return {
          error: doc.hosted?.error || "Could not start the PlayBound server.",
        };
      }
    }
  }

  if (isVirtualLanGame(slug) || hostMode === "self") {
    /*
     * Checked before readiness, because a party network can provision
     * perfectly and still be useless. A game that finds peers by broadcast
     * needs the discovery reflector inside its NetBird policy; without the
     * infra group id the policy is built without it, every call succeeds, and
     * the join simply never finds a host. That is the most expensive kind of
     * failure — it looks like the game is broken.
     */
    if (getMultiplayerAdapter(slug)?.virtualLan?.requiresBroadcast && !isDiscoveryReflectorConfigured()) {
      return {
        error:
          "LAN parties for this game need PlayBound's discovery reflector, which is not configured on this deployment.",
      };
    }
    let ls = doc.lan?.status || "none";
    if (ls === "ready" && doc.lan?.setupKey) {
      /* ready */
    } else if (ls === "pending" && !partyLanNeedsProvision(doc.lan)) {
      return { error: "Party network is still starting — wait a moment" };
    } else {
      if (partyLanNeedsProvision(doc.lan)) {
        await provisionPartyLan(doc);
      }
      ls = doc.lan?.status || "none";
      if (ls === "pending") {
        return { error: "Party network is still starting — wait a moment" };
      }
      if (ls !== "ready") {
        /*
         * An unconfigured deployment is not a failure anyone can act on, and
         * it does not look like one from the outside: provisionPartyLan
         * returns early without recording an error, so this fell back to
         * "Could not set up the party network" — which reads as a transient
         * fault and invites retrying forever.
         *
         * It matters because the member's side shows none of it. Their button
         * stays on "Waiting for host" until the party status flips, and the
         * status only flips after this function succeeds — so a HoloCure party
         * sits there indefinitely with the one legible message going to the
         * host alone.
         */
        if (!isVirtualLanConfigured()) {
          return {
            error:
              "LAN parties are unavailable: PlayBound's party network is not configured on this deployment.",
          };
        }
        return {
          error: doc.lan?.error || "Could not set up the party network.",
        };
      }
    }
  }

  return { ok: true };
}
