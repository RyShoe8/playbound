import { INSTALLATION_TARGETS } from "./installationTargets.js";

// Installation/update support is not proof of tenant isolation or content
// installation. Report these separately so the admin never conflates them.
const IDENTITY_PROFILES = Object.freeze({
  teeworlds:"teeworlds-unix-v1",bzflag:"bzflag-unix-v1",hedgewars:"hedgewars-unix-v1",
  openttd:"openttd-unix-v1",luanti:"luanti-unix-v1",openarena:"openarena-unix-v1",
  "battle-for-wesnoth":"battle-for-wesnoth-unix-v1","0ad":"0-ad-unix-v1",
  ysoccer:"ysoccer-unix-v1",flightgear:"flightgear-unix-v1",supertuxkart:"supertuxkart-unix-v1",mindustry:"mindustry-unix-v1","hurry-curry":"hurry-curry-unix-v1",assaultcube:"assaultcube-unix-v1",xonotic:"xonotic-unix-v1","wolfenstein-enemy-territory":"wolfenstein-enemy-territory-unix-v1",openmohaa:"medal-of-honor-allied-assault-unix-v1",freedoom:"freedoom-unix-v1",
});

export function hostingReadiness(key) {
  if (!Object.hasOwn(INSTALLATION_TARGETS,key)) throw new Error("Unknown hosting installation");
  const target=INSTALLATION_TARGETS[key];
  const profile=IDENTITY_PROFILES[key];
  let isolation=profile ? "operator_rollout" : "pending";
  let reason=profile
    ? "Identity handoff implemented. Each server still needs explicit offline enrollment; installation alone does not isolate it."
    : `${target.name}: customer UID, private data, network restrictions and management recovery still need implementation and acceptance.`;
  if (key==="supertuxkart") reason="Requires the root-promoted adapted engine and an allocated gameplay/discovery port pair. Query, restart adoption and rollback passed; each server still needs explicit offline enrollment.";
  if (key==="mindustry") reason="Identity handoff, native query and restart recovery passed. Requires explicit offline enrollment and a reviewed root JAR pin after updates; live console/control transport is not yet UID-aware.";
  if (key==="hurry-curry") reason="Requires offline enrollment, the root-promoted engine and pinned sealed YAML assets. Startup/restart/rollback passed; the isolated fixture stays unregistered and its occupancy is unknown. Public discovery and UID-aware controls remain pending.";
  if (key==="xonotic") reason="Requires offline enrollment, a root-promoted engine and immutable pinned 0.8.6 asset copy. Native player query, restart adoption and rollback passed. New isolated engine/assets require operator review after updates.";
  if (key==="wolfenstein-enemy-territory") reason="Requires offline enrollment, root-promoted 2.85.0 engine/assets and the original short-ID save path. Native query, restart and rollback passed. Omni-bot and public listing remain disabled in the isolated profile pending separate acceptance.";
  if (key==="openmohaa") reason="Requires offline enrollment, a root-promoted dedicated engine, pinned base-game assets and the original eight-character save suffix. Native query, restart and rollback passed. New isolated engine/assets need operator review.";
  if (key==="freedoom") reason="Only the explicit Zandronum edition with the pinned Freedoom 2 IWAD is supported by this identity profile. Requires offline enrollment and a root-promoted engine/assets. Native query, restart and rollback passed; base/other Doom engines are excluded.";
  let contentReason="Plugin and Workshop installation remains disabled until this game's tenant boundary and its content source/compatibility/rollback path pass acceptance.";
  if (key==="luanti") contentReason="Executable mods remain disabled: the pinned LuaJIT engine predates GHSA-g596-mf82-w8c3's fix. Engine mitigation/upgrade and content acceptance are required.";
  return {isolation,identityProfile:profile||null,reason,executableContentEnabled:false,contentReason};
}
