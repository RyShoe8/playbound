/**
 * Attach / release a VPS dedicated room on a party document.
 * Soft-fails so parties still work if the host box is down.
 */

import type { Document } from "mongoose";
import { getHostedInGameSteps } from "@/lib/multiplayer/adapters";
import { createHostRoom, deleteHostRoom, isGameHostConfigured, listHostRooms } from "./client";
import {
  emptyHostedPayload,
  isHostableGame,
  type HostedStatus,
} from "./catalog";
import { trackPartyEvent, trackPartyFailure, trackPartyOk } from "@/lib/playTogether/partyTelemetry";

export type PartyHostFields = {
  roomId?: string | null;
  status?: HostedStatus;
  host?: string | null;
  port?: number | null;
  name?: string | null;
  error?: string | null;
  roomCode?: string | null;
  provisionedAt?: Date | null;
};

type PartyLike = Document & {
  _id: { toString(): string };
  gameSlug: string;
  editionSlug?: string | null;
  maxSize?: number;
  hosted?: PartyHostFields;
  save: () => Promise<unknown>;
};

function ensureHosted(party: PartyLike): PartyHostFields {
  if (!party.hosted) {
    (party as { hosted: PartyHostFields }).hosted = {};
  }
  return party.hosted!;
}

/** Clear Mongo hosted state when the VPS room is gone (crash, idle timeout, redeploy). */
export async function reconcilePartyHostAlive(party: PartyLike): Promise<void> {
  const hosted = party.hosted;
  if (!hosted?.roomId || hosted.status !== "ready") return;
  if (!isGameHostConfigured()) return;

  const listed = await listHostRooms();
  if (!listed.ok) return;

  const alive = listed.rooms.some((room) => room.roomId === hosted.roomId);
  if (alive) return;

  hosted.roomId = null;
  hosted.status = "none";
  hosted.host = null;
  hosted.port = null;
  hosted.name = null;
  hosted.error = null;
  hosted.roomCode = null;
  await party.save();
}

export async function provisionPartyHost(party: PartyLike): Promise<boolean> {
  const slug = String(party.gameSlug || "");
  if (!isHostableGame(slug)) return false;

  await reconcilePartyHostAlive(party);
  const hosted = ensureHosted(party);
  if (hosted.status === "ready" && hosted.host && hosted.port) return true;

  if (!isGameHostConfigured()) {
    hosted.status = "failed";
    hosted.error = "PlayBound game host is not configured on this deployment.";
    await party.save();
    return false;
  }

  hosted.status = "pending";
  hosted.error = null;
  await party.save();

  const name = `PlayBound ${slug}`.slice(0, 40);
  const result = await createHostRoom({
    gameSlug: slug,
    partyId: String(party._id),
    name,
    maxPlayers: Number(party.maxSize) || 8,
    editionSlug: party.editionSlug || null,
  });

  if ("error" in result) {
    hosted.status = "failed";
    hosted.error = result.error;
    await party.save();
    trackPartyFailure("host", {
      op: "provision",
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
    });
    trackPartyEvent("party_hosted_failed", {
      partyId: String(party._id),
      gameSlug: slug,
      message: result.error,
    });
    return false;
  }

  hosted.status = "ready";
  hosted.roomId = result.roomId;
  hosted.host = result.host;
  hosted.port = result.port;
  hosted.name = result.name || name;
  hosted.roomCode = result.roomCode || null;
  hosted.error = null;
  hosted.provisionedAt = new Date();
  await party.save();
  trackPartyOk("host", { op: "provision", partyId: String(party._id), gameSlug: slug });
  trackPartyEvent("party_hosted_ready", {
    partyId: String(party._id),
    gameSlug: slug,
    host: result.host,
    port: result.port,
  });
  return true;
}

export async function releasePartyHost(party: PartyLike): Promise<void> {
  const hosted = party.hosted;
  if (!hosted?.roomId) {
    if (hosted && isHostableGame(String(party.gameSlug || ""))) {
      hosted.status = "none";
      hosted.host = null;
      hosted.port = null;
      hosted.error = null;
      hosted.roomCode = null;
    }
    return;
  }

  await deleteHostRoom(hosted.roomId);
  hosted.roomId = null;
  hosted.status = "none";
  hosted.host = null;
  hosted.port = null;
  hosted.name = null;
  hosted.error = null;
  hosted.roomCode = null;
}

export function hostedPayloadFromDoc(
  gameSlug: string,
  hosted?: PartyHostFields | null
) {
  const base = emptyHostedPayload(gameSlug);
  /*
   * Same reasoning as the virtual-LAN payload: without this the launcher
   * cannot tell "the room is still starting" from "this deployment has no game
   * host configured", so it blocked the launch and told the player to retry
   * something that would never become ready.
   */
  const configured = isGameHostConfigured();
  const steps = base.enabled ? getHostedInGameSteps(gameSlug) : [];
  if (!hosted) return { ...base, configured, steps };
  return {
    enabled: base.enabled,
    configured,
    status: (hosted.status as HostedStatus) || "none",
    host: hosted.host || null,
    port: typeof hosted.port === "number" ? hosted.port : null,
    name: hosted.name || null,
    error: hosted.error || null,
    roomCode: hosted.roomCode || null,
    steps,
  };
}
