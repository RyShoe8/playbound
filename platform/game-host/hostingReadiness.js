import { CUSTOMER_IDENTITY_GAMES } from "./customerIdentityProfiles.js";
import { installationKey } from "./installationTargets.js";
import { INSTALLATION_TARGETS } from "./installationTargets.js";

// Installation/update support is not proof of tenant isolation or content
// installation. Report these separately so the admin never conflates them.
const IDENTITY_PROFILES = Object.freeze(Object.fromEntries(
  [...CUSTOMER_IDENTITY_GAMES.map(game => [installationKey(game), `${game}-unix-v1`]),
   ...["combined-arms","romanovs-vengeance","tiberian-dawn-hd","crystallized-nexus"].map(key=>[key,"openra-unix-v1"])],
));

// These installations exist, but cannot use the native x86_64 tenant boundary.
// Explain the specific missing boundary instead of suggesting a generic retry.
const PENDING_BOUNDARIES = Object.freeze({
  "goldeneye-source": "The installed server uses Wine/Xvfb. A private Wine prefix, isolated display/Unix sockets and reviewed Windows engine boundary are not implemented; customer enrollment remains unavailable.",
  "deus-ex": "HX runs through Wine. Private Wine/display sockets, per-server Unreal data/config and the edition-specific process boundary are not implemented; customer enrollment remains unavailable.",
  "aneurism-iv": "The existing network namespace supervisor still launches under the shared service identity. A private UID/filesystem handoff that preserves Steam identity, credentials and saves is not implemented.",
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
  if (key==="terraria") reason="Requires offline enrollment and a root-published matching native loader, assembly and libraries. Private world creation/reload, connection-based occupancy, same-process recovery, scoped graceful stop and snapshot restore passed. Executable mods remain disabled.";
  if (key==="hypersomnia") reason="Requires offline enrollment and a root-promoted sealed headless AppImage. Bounded extraction, port fence, same-process recovery, stop and data rollback passed. Local occupancy remains unknown; this is isolation acceptance, not a player-query or Join verification.";
  if (key==="warzone-2100") reason="Requires offline enrollment and root-promoted paired engine/assets. Typed autohost settings, connection-based occupancy, same-process agent recovery, stop and data rollback passed. Executable mod installation remains disabled.";
  if (key==="freeciv") reason="Requires offline enrollment and root-promoted paired engine/libraries/rulesets. Native query, same-process agent recovery, stop and data rollback passed. Executable ruleset/plugin installation remains disabled.";
  if (key==="freedoom") reason="Only the explicit Zandronum edition with the pinned Freedoom 2 IWAD is supported by this identity profile. Requires offline enrollment and a root-promoted engine/assets. Native query, restart and rollback passed; base/other Doom engines are excluded.";
  if (key==="factorio") { isolation="blocked"; reason="Local identity candidate implemented; fenced world creation, restart recovery and backup acceptance are still required. Do not enroll customers yet."; }
  if (key==="unvanquished") { isolation="blocked"; reason="Local identity candidate needs NaCl sandbox startup, native query, recovery and snapshot acceptance before customer enrollment."; }
  if (["openra","openhv","earth-2140-trilogy","combined-arms","romanovs-vengeance","tiberian-dawn-hd","crystallized-nexus"].includes(key)) { isolation="blocked"; reason="Local typed engine-family candidate implemented; private .NET/AppImage startup, query, recovery and protected restore acceptance are required before enrollment."; }
  if (key==="rimworld-together") { isolation="blocked"; reason="Local isolated settings/console candidate implemented; .NET extraction, player telemetry, UID-aware controls, recovery and backup acceptance remain required."; }
  if (key==="space-station-14") { isolation="blocked"; reason="Local .NET namespace candidate implemented; paired runtime startup, native status/player query, recovery and private restore acceptance are still required."; }
  if (key==="triplea") { isolation="blocked"; reason="Local paired Java 25/JAR namespace candidate implemented; native startup/query, maps, process adoption and protected restore acceptance remain required."; }
  if (key==="necesse") { isolation="blocked"; reason="Local paired Java/JAR/native-library namespace candidate implemented; fenced world startup, native query, recovery, shutdown and restore acceptance remain required."; }
  if (key==="veloren") { isolation="blocked"; reason="Local pinned native/assets candidate with private world settings and metrics port implemented; cold world startup, native counts, graceful stop, recovery and restore acceptance remain required."; }
  if (key==="barotrauma") { isolation="blocked"; reason="Local pinned .NET/Content candidate with private XML, worlds and paired query port implemented; startup, query, controls, recovery and protected restore acceptance remain required."; }
  if (key==="dont-starve-together") { isolation="blocked"; reason="Local pinned 64-bit native candidate with private cluster and fenced Steam ports implemented; startup, native query, controls, recovery and restore acceptance remain required."; }
  if (key==="morrowind") { isolation="blocked"; reason="Local pinned TES3MP candidate with private saves and reviewed admin hook implemented; startup, UID-aware player/admin transports, recovery and restore acceptance remain required."; }
  if (["team-fortress-2","counter-strike-2"].includes(key)) { isolation="blocked"; reason="Local native 64-bit Source candidate with pinned depots and private config/log overlays implemented; storage publication, startup, native query, RCON, recovery and restore acceptance remain required."; }
  if (key==="trackmania") { isolation="blocked"; reason="Local pinned native/Packs candidate with private maps, account and XMLRPC settings implemented; startup, native query, private control transport, recovery and restore acceptance remain required."; }
  if (key==="unturned") { isolation="blocked"; reason="Local pinned Unity candidate with namespace-only private Servers binding and private GSLT implemented; startup, native query, Unity data-path behavior, console, recovery and restore acceptance remain required."; }
  if (key==="bombsquad") { isolation="blocked"; reason="Local paired Python/controller namespace candidate implemented; the previous isolated transport startup failed. Native transport/query, controller shutdown, recovery and restore acceptance remain required. Do not enroll customers."; }
  if (Object.hasOwn(PENDING_BOUNDARIES,key)) reason=PENDING_BOUNDARIES[key];
  if (key==="counter-strike-source") { isolation="blocked"; reason="Local pinned i386 Source candidate with direct-syscall checks and denied socketcall/ipc multiplexers implemented; native engine networking, startup/query/RCON, private configuration, recovery and restore acceptance remain required."; }
  if (key==="open-fortress") { isolation="blocked"; reason="Local paired i386 SDK/mod candidate with separate read-only TF2 dependency, private defaults/cache/config and fixed library aliases implemented; engine networking, native query/RCON, startup/recovery and protected restore acceptance remain required."; }
  if (key==="battlefield-1942-anthology") { isolation="blocked"; reason="Local pinned static i386 candidate with private typed settings/map overlay and disabled legacy discovery implemented; engine direct-syscall compatibility, startup/query, controls, recovery and restore acceptance remain required."; }
  let contentReason="Plugin and Workshop installation remains disabled until this game's tenant boundary and its content source/compatibility/rollback path pass acceptance.";
  if (key === "re-volt-rvgl") {
    isolation = "blocked";
    reason = "Isolated root-managed lobby start, UDP bind, same-process agent-restart adoption, stop and migration rollback passed on the VPS. Player occupancy, UID-aware lobby controls and human Join remain unverified; customer enrollment stays unavailable. RVGL has no world-data backup support.";
  }
  if (key === "core-keeper") {
    isolation = "blocked";
    reason = "Isolated root-managed start, native query, same-process agent-restart adoption, stop and saved-world restore passed on the VPS. Human Join, occupied-server behavior and UID-aware controls remain unverified; customer enrollment remains unavailable.";
  }
  if (key==="luanti") contentReason="Executable mods remain disabled: the pinned LuaJIT engine predates GHSA-g596-mf82-w8c3's fix. Engine mitigation/upgrade and content acceptance are required.";
  return {isolation,identityProfile:profile||null,reason,executableContentEnabled:false,contentReason};
}
