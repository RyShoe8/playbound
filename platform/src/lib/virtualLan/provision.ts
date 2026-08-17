/**
 * Attach / release a party's overlay network.
 *
 * Mirrors `gameHost/provision.ts` deliberately: same soft-fail contract, same
 * status vocabulary, so Join Game treats "the VPS is down" and "the overlay is
 * down" the same way — the party still forms, the game still launches, only
 * the automatic part is missing.
 */

import type { Document } from "mongoose";
import {
  authorizeLanMember,
  createLanNetwork,
  deleteLanNetwork,
  isValidNodeId,
  isVirtualLanConfigured,
} from "./client";
import { getVirtualLanConfig, isVirtualLanGame } from "@/lib/multiplayer/adapters";
import { trackPartyEvent } from "@/lib/playTogether/partyTelemetry";
import { markGameHealthYellow } from "@/lib/admin/gameHealth";

export type PartyLanStatus = "none" | "pending" | "ready" | "failed";

export type PartyLanFields = {
  networkId?: string | null;
  status?: PartyLanStatus;
  error?: string | null;
  /** Node IDs already let onto the segment, so re-joins are cheap. */
  authorizedNodeIds?: string[];
  provisionedAt?: Date | null;
};

type PartyLike = Document & {
  _id: { toString(): string };
  gameSlug: string;
  lan?: PartyLanFields;
  save: () => Promise<unknown>;
};

function ensureLan(party: PartyLike): PartyLanFields {
  if (!party.lan) {
    (party as { lan: PartyLanFields }).lan = {};
  }
  return party.lan!;
}

export async function provisionPartyLan(party: PartyLike): Promise<boolean> {
  const slug = String(party.gameSlug || "");
  if (!isVirtualLanGame(slug)) return false;

  const lan = ensureLan(party);
  if (lan.status === "ready" && lan.networkId) return true;
  if (!isVirtualLanConfigured()) return false;

  lan.status = "pending";
  lan.error = null;
  await party.save();

  const result = await createLanNetwork({
    name: `PlayBound ${slug}`.slice(0, 40),
    partyId: String(party._id),
  });

  if ("error" in result) {
    lan.status = "failed";
    lan.error = result.error;
    await party.save();
    trackPartyEvent("party_lan_failed", {
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
    });
    void markGameHealthYellow(slug, "party");
    return false;
  }

  lan.status = "ready";
  lan.networkId = result.networkId;
  lan.authorizedNodeIds = [];
  lan.error = null;
  lan.provisionedAt = new Date();
  await party.save();
  trackPartyEvent("party_lan_ready", {
    partyId: String(party._id),
    gameSlug: slug,
    networkId: result.networkId,
  });
  return true;
}

/**
 * Let a member's machine onto the party's segment.
 *
 * The launcher calls this once it knows its own node ID, which it only learns
 * after the overlay client is installed and running — so this is a separate
 * step from provisioning rather than part of it.
 */
export async function authorizePartyLanNode(
  party: PartyLike,
  nodeId: string
): Promise<{ networkId: string } | { error: string }> {
  const lan = party.lan;
  if (!lan?.networkId || lan.status !== "ready") {
    return { error: "This party has no virtual LAN" };
  }
  if (!isValidNodeId(nodeId)) {
    return { error: "That does not look like a network node ID" };
  }

  const already = (lan.authorizedNodeIds || []).includes(nodeId);
  if (already) return { networkId: lan.networkId };

  const res = await authorizeLanMember(lan.networkId, nodeId);
  if ("error" in res) return { error: res.error };

  lan.authorizedNodeIds = [...(lan.authorizedNodeIds || []), nodeId];
  await party.save();
  return { networkId: lan.networkId };
}

export async function releasePartyLan(party: PartyLike): Promise<void> {
  const lan = party.lan;
  if (!lan?.networkId) {
    if (lan) {
      lan.status = "none";
      lan.error = null;
    }
    return;
  }

  await deleteLanNetwork(lan.networkId);
  lan.networkId = null;
  lan.status = "none";
  lan.authorizedNodeIds = [];
  lan.error = null;
}

/**
 * What the launcher and the party window need to show. Carries the in-game
 * steps with it, because on a virtual-LAN game the player always has some
 * clicking left to do and hiding that makes it look broken.
 */
export function lanPayloadFromDoc(gameSlug: string, lan?: PartyLanFields | null) {
  const config = getVirtualLanConfig(gameSlug);
  if (!config) {
    return {
      enabled: false,
      status: "none" as PartyLanStatus,
      networkId: null,
      adapterFile: null,
      steps: [],
      error: null,
    };
  }
  return {
    enabled: true,
    status: (lan?.status as PartyLanStatus) || "none",
    networkId: lan?.networkId || null,
    // The launcher writes the overlay adapter's name here so the player can
    // take the "use saved adapter" path instead of hunting a dropdown.
    adapterFile: config.adapterFile || null,
    steps: config.inGameSteps || [],
    error: lan?.error || null,
  };
}
