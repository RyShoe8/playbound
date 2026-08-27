/**
 * Attach / release a party's overlay segment.
 *
 * Mirrors `gameHost/provision.ts` deliberately: same soft-fail contract, same
 * status vocabulary, so Join Game treats "the VPS is down" and "the overlay is
 * down" the same way — the party still forms, the game still launches, only
 * the automatic part is missing.
 */

import type { Document } from "mongoose";
import {
  createPartyNetwork,
  deletePartyNetwork,
  isVirtualLanConfigured,
  managementUrl,
  type NetBirdParty,
} from "./client";
import { getVirtualLanConfig, isVirtualLanGame } from "@/lib/multiplayer/adapters";
import { defaultHostMode } from "@/lib/multiplayer/hostModes";
import { trackPartyEvent, trackPartyFailure, trackPartyOk } from "@/lib/playTogether/partyTelemetry";

export type PartyLanStatus = "none" | "pending" | "ready" | "failed";

/** How long a pending overlay can sit before we treat the attempt as dead. */
const LAN_PENDING_STALE_MS = 45_000;

export type PartyLanFields = Partial<NetBirdParty> & {
  status?: PartyLanStatus;
  error?: string | null;
  provisionedAt?: Date | null;
  pendingAt?: Date | null;
};

type PartyLike = Document & {
  _id: { toString(): string };
  gameSlug: string;
  maxSize?: number;
  /** Where the room runs. A self-hosted room needs the overlay to be reachable. */
  hostMode?: string | null;
  lan?: PartyLanFields;
  save: () => Promise<unknown>;
};

function isLanPendingStale(lan?: PartyLanFields | null): boolean {
  if (!lan || lan.status !== "pending") return false;
  const started = lan.pendingAt ? new Date(lan.pendingAt).getTime() : 0;
  // Missing timestamp = leftover from before pendingAt existed; safe to retry.
  if (!started) return true;
  return Date.now() - started > LAN_PENDING_STALE_MS;
}

/** True when Ready/Join should kick provisioning again (including stale pending). */
export function partyLanNeedsProvision(lan?: PartyLanFields | null): boolean {
  const status = lan?.status || "none";
  return status === "none" || status === "failed" || isLanPendingStale(lan);
}

/**
 * Does this party need an overlay segment?
 *
 * Two reasons, not one. A virtual-lan game always needs it — the game finds
 * peers by LAN discovery and has no address to dial. A self-hosted room needs
 * it for a different reason: the host is behind their own NAT, and the overlay
 * is what makes them addressable to the rest of the party without port
 * forwarding. Gating solely on the game's adapter type, as this did, meant a
 * self-hosted room on any other game had no reachable path to the host.
 */
function partyNeedsOverlay(party: PartyLike, slug: string): boolean {
  if (isVirtualLanGame(slug)) return true;
  return String(party.hostMode || "") === "self";
}

function ensureLan(party: PartyLike): PartyLanFields {
  if (!party.lan) {
    (party as { lan: PartyLanFields }).lan = {};
  }
  return party.lan!;
}

export async function provisionPartyLan(party: PartyLike): Promise<boolean> {
  const slug = String(party.gameSlug || "");
  if (!partyNeedsOverlay(party, slug)) return false;

  const lan = ensureLan(party);
  if (lan.status === "ready" && lan.setupKey) return true;
  if (lan.status === "pending" && !isLanPendingStale(lan)) return false;
  if (!isVirtualLanConfigured()) return false;

  lan.status = "pending";
  lan.pendingAt = new Date();
  lan.error = null;
  await party.save();

  const result = await createPartyNetwork({
    partyId: String(party._id),
    name: "PlayBound.club Party",
    maxPeers: Number(party.maxSize) || 8,
  });

  if ("error" in result) {
    lan.status = "failed";
    lan.error = result.error;
    lan.pendingAt = null;
    await party.save();
    const netbirdStatus = /NetBird (\d+)/.exec(result.error)?.[1];
    trackPartyFailure("lan", {
      op: "provision",
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
      status: netbirdStatus ? Number(netbirdStatus) : undefined,
      code: netbirdStatus ? `NETBIRD_${netbirdStatus}` : "NETBIRD_PROVISION_FAILED",
    });
    trackPartyEvent("party_lan_failed", {
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
      code: netbirdStatus ? `NETBIRD_${netbirdStatus}` : "NETBIRD_PROVISION_FAILED",
      status: netbirdStatus ? Number(netbirdStatus) : undefined,
      htmlDashboardLeak: /dashboard HTML instead of JSON/i.test(result.error),
    });
    return false;
  }

  lan.status = "ready";
  lan.groupId = result.groupId;
  lan.policyId = result.policyId;
  lan.setupKeyId = result.setupKeyId;
  lan.setupKey = result.setupKey;
  lan.error = null;
  lan.pendingAt = null;
  lan.provisionedAt = new Date();
  await party.save();
  trackPartyOk("lan", { op: "provision", partyId: String(party._id), gameSlug: slug });
  trackPartyEvent("party_lan_ready", {
    partyId: String(party._id),
    gameSlug: slug,
    groupId: result.groupId,
  });
  return true;
}

/**
 * The credentials a member's launcher needs to enrol.
 *
 * Deliberately not part of the party payload: the setup key enrols a machine
 * onto the segment, so it goes out through one authenticated call to a
 * confirmed member rather than riding along on every party read.
 */
export function partyLanEnrollment(
  party: PartyLike
): { managementUrl: string; setupKey: string } | { error: string } {
  const lan = party.lan;
  if (!lan?.setupKey || lan.status !== "ready") {
    return { error: "This party has no virtual LAN" };
  }
  const url = managementUrl();
  if (!url) return { error: "Virtual LAN is not configured" };
  return { managementUrl: url, setupKey: lan.setupKey };
}

export async function releasePartyLan(party: PartyLike): Promise<void> {
  const lan = party.lan;
  if (!lan?.groupId && !lan?.setupKeyId) {
    if (lan) {
      lan.status = "none";
      lan.error = null;
    }
    return;
  }

  await deletePartyNetwork(lan);
  lan.groupId = null as unknown as undefined;
  lan.policyId = null as unknown as undefined;
  lan.setupKeyId = null as unknown as undefined;
  lan.setupKey = null as unknown as undefined;
  lan.status = "none";
  lan.error = null;
  lan.pendingAt = null;
}

/**
 * What the launcher and the party window need to show. Carries the in-game
 * steps with it, because on a virtual-LAN game the player always has some
 * clicking left to do and hiding that makes it look broken.
 *
 * No setup key here — see `partyLanEnrollment`.
 */
export function lanPayloadFromDoc(
  gameSlug: string,
  hostMode: string | null,
  lan?: PartyLanFields | null
) {
  const resolvedMode = hostMode || defaultHostMode(gameSlug);
  const needsOverlay =
    resolvedMode !== "public" && (isVirtualLanGame(gameSlug) || resolvedMode === "self");
  const config = needsOverlay ? getVirtualLanConfig(gameSlug) : null;
  if (!config) {
    return {
      enabled: false,
      configured: isVirtualLanConfigured(),
      status: "none" as PartyLanStatus,
      adapterFile: null,
      steps: [],
      error: null,
    };
  }
  return {
    enabled: true,
    /*
     * Whether an overlay could ever be provisioned, as opposed to not having
     * been yet. Without this the launcher cannot tell "still setting up" from
     * "this deployment has no NetBird credentials", so it told players to try
     * again in a moment for something that was never going to become ready —
     * and refused to launch the game while it waited.
     */
    configured: isVirtualLanConfigured(),
    status: (lan?.status as PartyLanStatus) || "none",
    // The launcher writes the overlay adapter's name here so the player can
    // take the "use saved adapter" path instead of hunting a dropdown.
    adapterFile: config.adapterFile || null,
    steps: config.inGameSteps || [],
    error: lan?.error || null,
  };
}
