/**
 * Party service — the public surface.
 *
 * A party is a PlayBound coordination object. Discord remains the chat layer;
 * PlayBound handles who is playing together, configuration, readiness,
 * and launching.
 *
 * Every mutation touches `lastActivity` so the stale sweep has a single
 * reliable indicator of whether a party is still alive.
 *
 * Implementation lives in ./party/*, one module per concern (connect, people,
 * serialize, membership, settings, session, queries, configSync, sweep).
 * Import from here so callers do not depend on which file a function lives in.
 */

export { toPublicPartyPayload } from "./party/serialize";
export type { PublicPartyPayload } from "./party/serialize";
export { createParty, joinParty, leaveParty, dropOfflinePartyMembers, removeMember, transferLeadership } from "./party/membership";
export { setPartyGame, setPartyHostMode, setPartySavedWorld, setPartyCouchSession, setPartyPublicServer, setPartyEdition, setPartyOpenRaMod, setPartyName, setVisibility, setReady } from "./party/settings";
export { joinPartyGame, exitPartyGame, launchParty, markSelfHostReady, endParty } from "./party/session";
export { getParty, listPartiesForUser, listDiscoverableParties, listOpenPublicParties, countOpenPublicParties } from "./party/queries";
export { checkConfigSync } from "./party/configSync";
export type { ConfigSyncMember, ConfigSyncResult } from "./party/configSync";
export { touchPartyActivityFromPresence, sweepStaleParties, handleUserPresenceEnded } from "./party/sweep";
export { getPartyCapability } from "./party/legacy";
export type { PartyPhase, PartyIntent } from "./party/legacy";
