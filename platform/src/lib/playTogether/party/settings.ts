/** Leader choices before launch: game, host mode, world, server, edition, name, visibility, ready. */
import { randomBytes } from "crypto";
import { Types } from "mongoose";
import { canUseSavedWorld, discardUnplayedPartyWorld, supportsSavedWorlds } from "@/lib/savedWorlds";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getGame } from "@/lib/catalog";
import { SITE_URL } from "@/lib/site";
import { couchJoinUrl } from "@/lib/couch/joinUrl";
import { listEditionsForGame } from "@/lib/editions";
import { type PartyVisibility, type PartyPayload, type OpenRaModSlug, normalizePartyName, OPENRA_MODS } from "@/lib/playTogether/types";
import { openRaEditionAllowsStockModPicker } from "@/lib/multiplayer/openRaMod";
import { trackPartyEvent } from "@/lib/playTogether/partyTelemetry";
import { setPresenceParty } from "@/lib/presence/server";
import { renamePartyDiscordVoice } from "@/lib/playTogether/discordPartyProvision";
import { releasePartyHost } from "@/lib/gameHost/provision";
import { releasePartyLan } from "@/lib/virtualLan/provision";
import { defaultHostMode, isValidHostMode, resolvedHostMode, type PartyHostMode } from "@/lib/multiplayer/hostModes";
import { preferredPartyEditionSlug } from "@/lib/playTogether/partyEdition";
import { checkConfigSync } from "./configSync";
import { parsePublicServer, provisionPartyConnectInBackground, resetPartyConnectState } from "./connect";
import { resolvePartyPeople } from "./people";
import { attachConfigSync, hashPartyPassword, partyMemberIds, partyPayloadForDoc } from "./serialize";

/* ─── game (picked after create) ─────────────────────────────────────────── */

export async function setPartyGame(
  partyId: string,
  leaderId: string,
  gameSlug: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const slug = gameSlug.trim();
  const game = slug ? await getGame(slug, { includeTesting: true }) : null;
  if (!game) return { error: "Game not found", status: 404 };

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change the game", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }

  /*
   * Switching games mid-session is the normal way a party moves on: play one
   * game, finish, pick another. That means winding the party back to forming —
   * the old dedicated server is released so it is not left running for a game
   * nobody is in, and everyone re-readies for the new pick rather than being
   * carried into it by a stale ready flag.
   */
  const previousSlug = String(doc.gameSlug || "");
  const switchingGame = previousSlug !== slug;
  const wasInSession = doc.status === "playing" || doc.status === "launching";

  if (switchingGame && (wasInSession || doc.hosted?.roomId)) {
    await releasePartyHost(doc);
    await releasePartyLan(doc);
  }
  if (switchingGame) {
    doc.status = "forming";
    for (const member of doc.members) member.ready = false;
  }

  doc.gameSlug = slug;
  if (!Array.isArray(doc.gamesPlayed)) {
    doc.gamesPlayed = [];
  }
  if (slug && !doc.gamesPlayed.includes(slug)) {
    doc.gamesPlayed.push(slug);
  }
  if (switchingGame) {
    /*
     * Leaving this null was fine for a single-edition game, but a game like
     * Freedoom (GZDoom singleplayer vs. Zandronum multiplayer vs. DSDA
     * speedrun) has no UI for the leader to pick one, so it stayed null
     * forever — every install prompt then had nothing to scope to and fell
     * back to the ambiguous base install, which is not necessarily one the
     * party can actually connect with.
     *
     * A party is inherently a multiplayer context, so among several editions
     * the only ones worth considering are the ones tagged "Multiplayer" —
     * never a singleplayer-only edition, even if that happens to be the
     * catalog's general-purpose default. Falls back to every edition only if
     * none are tagged multiplayer (stale catalog data), and stays null for a
     * single-edition game exactly as before, since there is nothing to
     * disambiguate.
     */
    doc.modSlugs = [];
    /*
     * Preferred edition from the catalog is not the same as the host choosing
     * one — guests must wait until Install / the edition picker runs.
     */
    doc.versionSelectedByHost = false;
    /*
     * Host mode belongs to the game, not the party: "my computer" is a valid
     * choice for a peer-hostable game and meaningless for one that only runs
     * on the VPS. Carrying the old pick across a game switch would leave a
     * party self-hosting a game whose client cannot host, so it resets to
     * whatever the new game's default is.
     */
    doc.hostMode = defaultHostMode(slug);
    resetPartyConnectState(doc);
  }
  /*
   * Also repair parties created before multiplayer-aware edition selection.
   * Re-selecting the same game used to leave Freedoom locked to GZDoom, so
   * every member was told to install an edition that cannot join the party.
   */
  const editions = await listEditionsForGame(game);
  doc.editionSlug = preferredPartyEditionSlug(editions, doc.editionSlug, slug);
  /*
   * openRaMod only applies to stock OpenRA Official. Leaving it set when the
   * party switches to another game (or a fixed-mod OpenRA edition) made VPS
   * provision / joins keep Game.Mod=ra against the wrong portable.
   */
  if (slug !== "openra") {
    doc.openRaMod = null;
  } else if (!openRaEditionAllowsStockModPicker(doc.editionSlug)) {
    doc.openRaMod = null;
  }
  doc.lastActivity = new Date();
  await doc.save();

  const memberIds: string[] = doc.members.map((m: { userId: unknown }) => String(m.userId));
  const plain = doc.toObject() as Record<string, unknown>;
  const [, people] = await Promise.all([
    Promise.all(
      memberIds.map((userId) =>
        setPresenceParty(userId, { partyId: String(doc._id), gameSlug: slug })
      )
    ),
    resolvePartyPeople(partyMemberIds(plain)),
  ]);

  let updated = await partyPayloadForDoc(plain, { people, gameTitle: game.title });
  trackPartyEvent("party_game_set", {
    partyId: updated.id,
    gameSlug: slug,
    userId: leaderId,
  });
  if (updated.gameSlug) {
    // The game just changed, so anything cached describes the previous one.
    const sync = await checkConfigSync(updated.id, { doc: plain, fresh: true });
    if (!("error" in sync)) {
      updated = { ...updated, configSync: sync.sync };
      if (!sync.sync.allReady) {
        trackPartyEvent("party_config_sync", {
          partyId: updated.id,
          gameSlug: slug,
          userId: leaderId,
          allReady: false,
          missing: sync.sync.members.filter((m) => !m.hasGame).map((m) => m.userId),
        });
      }
    }
  }
  return {
    party: updated,
    status: 200,
  };
}

/**
 * Change where the party's room runs.
 *
 * Leader-only, and refused once a room already exists: the mode decides
 * whether a dedicated server or an overlay gets provisioned, so switching
 * underneath a live room would leave members connected to something the party
 * no longer describes. Pick before launching, or after the session ends.
 */
export async function setPartyHostMode(
  partyId: string,
  leaderId: string,
  hostMode: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change where the game is hosted", status: 403 };
  }
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };

  const slug = String(doc.gameSlug || "");
  if (!slug) return { error: "Pick a game first", status: 400 };
  if (!isValidHostMode(slug, hostMode)) {
    return { error: "That hosting option is not available for this game", status: 400 };
  }
  if (doc.status === "playing" || doc.status === "launching") {
    return { error: "Can't change hosting while a room is live", status: 400 };
  }

  if (doc.hostMode !== hostMode) {
    if (doc.hosted?.roomId) {
      await releasePartyHost(doc);
    }
    if (doc.lan?.groupId) {
      await releasePartyLan(doc);
    }
    doc.hostMode = hostMode as PartyHostMode;
    resetPartyConnectState(doc);
    doc.lastActivity = new Date();
    await doc.save();
    trackPartyEvent("party_host_mode_set", { partyId: String(doc._id), gameSlug: slug, userId: leaderId, hostMode });
  }

  return { party: await partyPayloadForDoc(provisionPartyConnectInBackground(doc, doc.toObject())), status: 200 };
}

/**
 * Choose which saved world the party's PlayBound server runs.
 *
 * Picking "PlayBound server" provisions straight away, and that first start
 * creates a new world. So switching here restarts the room on the chosen
 * world, and drops the world the party created moments ago if nobody has
 * played on it outside this party. `worldId` null means "New world".
 */
export async function setPartySavedWorld(
  partyId: string,
  leaderId: string,
  worldId: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();
  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can choose the world", status: 403 };
  }
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };
  const slug = String(doc.gameSlug || "");
  if (!supportsSavedWorlds(slug) || resolvedHostMode(slug, doc.hostMode, doc.hosted) !== "dedicated") {
    return { error: "Saved worlds are only for PlayBound servers of this game", status: 400 };
  }
  if (doc.status === "playing" || doc.status === "launching") {
    return { error: "Can't change the world while the game is running", status: 400 };
  }
  if (worldId && !(await canUseSavedWorld(leaderId, worldId, slug))) {
    return { error: "That saved world is not available", status: 400 };
  }

  const previous = doc.savedWorldId ? String(doc.savedWorldId) : null;
  if (previous !== worldId) {
    if (doc.hosted?.roomId) await releasePartyHost(doc);
    if (previous) await discardUnplayedPartyWorld(previous, doc);
    doc.savedWorldId = worldId ? new Types.ObjectId(worldId) : null;
    resetPartyConnectState(doc);
    doc.lastActivity = new Date();
    await doc.save();
  }
  return { party: await partyPayloadForDoc(provisionPartyConnectInBackground(doc, doc.toObject())), status: 200 };
}

/**
 * Pick a community dedicated server for a party on public host mode.
 *
 * Leader-only. Refused while playing so members are not sent to a different
 * address mid-session. Switching games or host modes already clears the pick.
 */
/**
 * Publish the leader's couch session to the party, so members get the
 * controller link without the leader reading a code out loud.
 *
 * Called by the leader's launcher right after it starts a couch session, and
 * again with null when the session ends. The join code is not a credential —
 * it is what a phone types to join, and the party is already the set of people
 * meant to have it — so this stores it verbatim rather than handing it out
 * through a per-member call the way the LAN setup key is.
 */
export async function setPartyCouchSession(
  partyId: string,
  leaderId: string,
  raw: unknown
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader runs the game in couch mode", status: 403 };
  }
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };

  const slug = String(doc.gameSlug || "");
  if (!slug) return { error: "Pick a game first", status: 400 };
  if (resolvedHostMode(slug, doc.hostMode, doc.hosted) !== "couch") {
    return { error: "This party is not playing couch co-op", status: 400 };
  }

  if (!doc.couch) doc.couch = {};

  if (raw === null) {
    doc.couch.status = "none";
    doc.couch.joinCode = null;
    doc.couch.joinUrl = null;
    doc.couch.error = null;
    doc.couch.startedAt = null;
  } else {
    const o = (raw || {}) as Record<string, unknown>;
    const error = typeof o.error === "string" ? o.error.trim().slice(0, 300) : "";
    if (error) {
      doc.couch.status = "failed";
      doc.couch.error = error;
      doc.couch.joinCode = null;
      doc.couch.joinUrl = null;
    } else {
      const joinCode = typeof o.joinCode === "string" ? o.joinCode.trim() : "";
      // Codes come from createCouchSession; anything else is a client bug or a
      // forged call, and a bad code would send the whole party to a dead page.
      if (!/^[A-Za-z0-9-]{4,16}$/.test(joinCode)) {
        return { error: "That couch code is not valid.", status: 400 };
      }
      doc.couch.status = "ready";
      doc.couch.error = null;
      doc.couch.joinCode = joinCode;
      // Never persist a launcher-supplied URL. Even the leader is not allowed
      // to turn a party response into an arbitrary phishing link.
      doc.couch.joinUrl = couchJoinUrl(joinCode, SITE_URL);
      doc.couch.startedAt = new Date();
    }
  }

  doc.lastActivity = new Date();
  await doc.save();
  return { party: await partyPayloadForDoc(doc.toObject()), status: 200 };
}

export async function setPartyPublicServer(
  partyId: string,
  leaderId: string,
  raw: unknown
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can pick the public server", status: 403 };
  }
  if (doc.status === "ended") return { error: "Party has ended", status: 400 };
  if (doc.status === "playing" || doc.status === "launching") {
    return { error: "Can't change servers while the party is in a game", status: 400 };
  }

  const slug = String(doc.gameSlug || "");
  if (!slug) return { error: "Pick a game first", status: 400 };

  const hostMode = resolvedHostMode(slug, doc.hostMode, doc.hosted);
  if (hostMode !== "public") {
    return { error: "This party is not set to a public server", status: 400 };
  }
  if (!isValidHostMode(slug, "public")) {
    return { error: "This game has no public server list", status: 400 };
  }

  const parsed = parsePublicServer(raw);
  if ("error" in parsed) {
    return { error: parsed.error, status: 400 };
  }

  const server = parsed;
  doc.hostMode = "public";
  doc.publicServer = {
    id: server.id || `${server.host}:${server.port}`,
    name: server.name || `${server.host}:${server.port}`,
    host: server.host,
    port: server.port,
    mod: server.mod || null,
    protected: Boolean(server.protected),
  };
  if (
    slug === "openra" &&
    server.mod &&
    (OPENRA_MODS as readonly string[]).includes(server.mod)
  ) {
    doc.openRaMod = server.mod as OpenRaModSlug;
  }
  doc.lastActivity = new Date();
  await doc.save();
  trackPartyEvent("party_public_server_set", {
    partyId: String(doc._id),
    gameSlug: slug,
    userId: leaderId,
    host: server.host,
    port: server.port,
  });

  return { party: await partyPayloadForDoc(doc.toObject()), status: 200 };
}

export async function setPartyEdition(
  partyId: string,
  leaderId: string,
  editionSlug: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change the edition", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }
  if (!doc.gameSlug) {
    return { error: "Pick a game first", status: 400 };
  }

  const game = await getGame(String(doc.gameSlug), { includeTesting: true });
  if (!game) return { error: "Game not found", status: 404 };

  const slug = typeof editionSlug === "string" ? editionSlug.trim() : "";
  if (slug) {
    const editions = await listEditionsForGame(game);
    if (!editions.some((edition) => edition.slug === slug)) {
      return { error: "Edition not found", status: 404 };
    }
  }

  const previousEdition = doc.editionSlug || null;
  const newEdition = slug || null;
  if (previousEdition !== newEdition) {
    for (const member of doc.members) member.ready = false;
  }
  doc.editionSlug = newEdition;
  /*
   * Host explicitly chose this version (picker or Install). Guests may install
   * from here — preferredPartyEditionSlug alone must not unlock guest Install.
   */
  doc.versionSelectedByHost = true;
  if (String(doc.gameSlug) === "openra") {
    if (openRaEditionAllowsStockModPicker(newEdition)) {
      // Switching onto Official from a fixed-mod edition: default Red Alert.
      if (!openRaEditionAllowsStockModPicker(previousEdition)) {
        doc.openRaMod = null;
      }
    } else {
      doc.openRaMod = null;
    }
  }
  doc.lastActivity = new Date();
  await doc.save();

  trackPartyEvent("party_edition_set", {
    partyId: String(doc._id),
    gameSlug: String(doc.gameSlug || "") || null,
    editionSlug: slug || null,
    userId: leaderId,
  });
  const plain = doc.toObject() as Record<string, unknown>;
  const serialized = await partyPayloadForDoc(plain, { gameTitle: game.title });
  return {
    // The edition is what config-sync compares against, so this read must see
    // the write above rather than the value cached moments before it.
    party: await attachConfigSync(serialized, leaderId, { doc: plain, fresh: true }),
    status: 200,
  };
}

/**
 * Which of Red Alert / Tiberian Dawn / Dune 2000 an OpenRA party is playing.
 *
 * OpenRA's "official" edition is one client covering all three, so there is
 * no edition slug to infer this from — without an explicit choice a joiner's
 * launcher always assumed "ra" and got rejected by any other mod's server
 * with "the server is running an incompatible mod". See openRaMod.ts.
 */
export async function setPartyOpenRaMod(
  partyId: string,
  leaderId: string,
  mod: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change this", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }
  if (doc.gameSlug !== "openra") {
    return { error: "Not an OpenRA party", status: 400 };
  }

  const value = typeof mod === "string" ? mod.trim() : "";
  if (value && !(OPENRA_MODS as readonly string[]).includes(value)) {
    return { error: "Invalid mod", status: 400 };
  }

  const previousMod = doc.openRaMod || null;
  const newMod = (value || null) as OpenRaModSlug | null;
  if (previousMod !== newMod) {
    for (const member of doc.members) member.ready = false;
  }
  doc.openRaMod = newMod;
  doc.lastActivity = new Date();
  await doc.save();

  trackPartyEvent("party_openra_mod_set", {
    partyId: String(doc._id),
    userId: leaderId,
    openRaMod: value || null,
  });
  const plain = doc.toObject() as Record<string, unknown>;
  const serialized = await partyPayloadForDoc(plain, { gameTitle: "OpenRA" });
  return {
    party: await attachConfigSync(serialized, leaderId, { doc: plain }),
    status: 200,
  };
}

export async function setPartyName(
  partyId: string,
  leaderId: string,
  name: string | null
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can rename the party", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }

  doc.name = normalizePartyName(name);
  doc.lastActivity = new Date();
  await doc.save();
  if (doc.discord?.voiceChannelId) {
    await renamePartyDiscordVoice(doc, doc.name);
  }

  return {
    party: await partyPayloadForDoc(doc.toObject()),
    status: 200,
  };
}

/* ─── visibility (4F) ────────────────────────────────────────────────────── */

export async function setVisibility(
  partyId: string,
  leaderId: string,
  visibility: PartyVisibility,
  password?: string
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 403 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };

  if (String(doc.leaderId) !== leaderId) {
    return { error: "Only the leader can change visibility", status: 403 };
  }
  if (doc.status === "ended") {
    return { error: "Party has ended", status: 400 };
  }
  if (doc.eventId && visibility !== "event") {
    return { error: "Event parties must stay on event visibility", status: 400 };
  }

  if (visibility === "password") {
    if (String(password || "").length < 4) {
      return { error: "Password must be at least 4 characters", status: 400 };
    }
    doc.passwordSalt = randomBytes(16).toString("hex");
    doc.passwordHash = hashPartyPassword(String(password), doc.passwordSalt);
  } else {
    doc.passwordSalt = null;
    doc.passwordHash = null;
  }
  doc.visibility = visibility;
  doc.lastActivity = new Date();
  await doc.save();

  return {
    party: await partyPayloadForDoc(doc.toObject()),
    status: 200,
  };
}

/* ─── ready toggle (4G) ──────────────────────────────────────────────────── */

export async function setReady(
  partyId: string,
  userId: string,
  ready: boolean
): Promise<{ party: PartyPayload; status: 200 } | { error: string; status: 400 | 404 }> {
  await dbConnect();

  const doc = await Party.findById(partyId);
  if (!doc) return { error: "Party not found", status: 404 };
  if (!doc.gameSlug) {
    return { error: "Pick a game before ready-up", status: 400 };
  }
  if (doc.status === "ended" || doc.status === "launching" || doc.status === "playing") {
    return { error: "Cannot change ready state now", status: 400 };
  }

  const member = doc.members.find(
    (m: { userId: unknown }) => String(m.userId) === userId
  );
  if (!member) {
    return { error: "Not in this party", status: 400 };
  }

  member.ready = ready;
  doc.lastActivity = new Date();
  doc.status = doc.members.every((m: { ready?: boolean }) => Boolean(m.ready))
    ? "ready"
    : "forming";

  try {
    await doc.save();
  } catch (err) {
    console.error(`[party] ready save failed for ${partyId}:`, err);
    throw err;
  }

  return {
    party: await partyPayloadForDoc(provisionPartyConnectInBackground(doc, doc.toObject())),
    status: 200,
  };
}
