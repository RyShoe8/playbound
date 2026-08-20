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
import { trackPartyEvent, trackPartyFailure, trackPartyOk } from "@/lib/playTogether/partyTelemetry";

export type PartyLanStatus = "none" | "pending" | "ready" | "failed";

export type PartyLanFields = Partial<NetBirdParty> & {
  status?: PartyLanStatus;
  error?: string | null;
  provisionedAt?: Date | null;
};

type PartyLike = Document & {
  _id: { toString(): string };
  gameSlug: string;
  maxSize?: number;
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
  if (lan.status === "ready" && lan.setupKey) return true;
  if (!isVirtualLanConfigured()) return false;

  lan.status = "pending";
  lan.error = null;
  await party.save();

  const result = await createPartyNetwork({
    partyId: String(party._id),
    name: `PlayBound ${slug}`.slice(0, 40),
    maxPeers: Number(party.maxSize) || 8,
  });

  if ("error" in result) {
    lan.status = "failed";
    lan.error = result.error;
    await party.save();
    trackPartyFailure("lan", {
      op: "provision",
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
    });
    trackPartyEvent("party_lan_failed", {
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
    });
    return false;
  }

  lan.status = "ready";
  lan.groupId = result.groupId;
  lan.policyId = result.policyId;
  lan.setupKeyId = result.setupKeyId;
  lan.setupKey = result.setupKey;
  lan.error = null;
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
}

/**
 * What the launcher and the party window need to show. Carries the in-game
 * steps with it, because on a virtual-LAN game the player always has some
 * clicking left to do and hiding that makes it look broken.
 *
 * No setup key here — see `partyLanEnrollment`.
 */
export function lanPayloadFromDoc(gameSlug: string, lan?: PartyLanFields | null) {
  const config = getVirtualLanConfig(gameSlug);
  if (!config) {
    return {
      enabled: false,
      status: "none" as PartyLanStatus,
      adapterFile: null,
      steps: [],
      error: null,
    };
  }
  return {
    enabled: true,
    status: (lan?.status as PartyLanStatus) || "none",
    // The launcher writes the overlay adapter's name here so the player can
    // take the "use saved adapter" path instead of hunting a dropdown.
    adapterFile: config.adapterFile || null,
    steps: config.inGameSteps || [],
    error: lan?.error || null,
  };
}
