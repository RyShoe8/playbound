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

// Passed protected-restore acceptance on the VPS on 2026-10-30 (staging fixture
// ffff…f1): isolated start, stop, world backup, restore with a pre-restore
// copy and baseline retained, restored data owned by the private UID, restart
// on the restored data, same-process agent-restart adoption, stop, cleanup.
// Evidence: native-identity-acceptance/<game>.json → protectedRestoreAcceptance.
// Not covered: in-game console/RCON driven as the private UID.
const RESTORE_ACCEPTED = Object.freeze({
  "necesse": "",
  "morrowind": " The own-port UDP self-test firewall rule stays required.",
  "openhv": " Needs the 2 GiB allocation (4 GiB envelope, 12 GiB address space).",
  "openra": " Needs the 2 GiB allocation (4 GiB envelope, 12 GiB address space).",
  "earth-2140-trilogy": " Needs the 2 GiB allocation (4 GiB envelope, 12 GiB address space).",
  "space-station-14": " Accepted at a 4 GiB allocation.",
  "rimworld-together": "",
  "triplea": " Map installation is not covered.",
  "barotrauma": "",
  "veloren": "",
  "combined-arms": " Needs the 2 GiB allocation; verified running its own mod (ca).",
  "romanovs-vengeance": " Needs the 2 GiB allocation; verified running its own mod (rv).",
  "tiberian-dawn-hd": " Needs the 2 GiB allocation; verified running its own mod (cnc).",
  "crystallized-nexus": " Needs the 2 GiB allocation; verified running its own mod (cn).",
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
  if (key==="hurry-curry") reason="Requires offline enrollment, the root-promoted engine and pinned sealed YAML assets. Startup/restart/rollback passed; the isolated fixture stays unregistered. Public discovery and UID-aware controls remain pending.";
  if (key==="xonotic") reason="Requires offline enrollment, a root-promoted engine and immutable pinned 0.8.6 asset copy. Native player query, restart adoption and rollback passed. New isolated engine/assets require operator review after updates.";
  if (key==="wolfenstein-enemy-territory") reason="Requires offline enrollment, root-promoted 2.85.0 engine/assets and the original short-ID save path. Native query, restart and rollback passed. Omni-bot and public listing remain disabled in the isolated profile pending separate acceptance.";
  if (key==="openmohaa") reason="Requires offline enrollment, a root-promoted dedicated engine, pinned base-game assets and the original eight-character save suffix. Native query, restart and rollback passed. New isolated engine/assets need operator review.";
  if (key==="terraria") reason="Requires offline enrollment and a root-published matching native loader, assembly and libraries. Private world creation/reload, connection-based occupancy, same-process recovery, scoped graceful stop and snapshot restore passed. Executable mods remain disabled.";
  if (key==="hypersomnia") reason="Requires offline enrollment and a root-promoted sealed headless AppImage. Bounded extraction, port fence, same-process recovery, stop and data rollback passed.";
  if (key==="warzone-2100") reason="Requires offline enrollment and root-promoted paired engine/assets. Typed autohost settings, connection-based occupancy, same-process agent recovery, stop and data rollback passed. Executable mod installation remains disabled.";
  if (key==="freeciv") reason="Requires offline enrollment and root-promoted paired engine/libraries/rulesets. Native query, same-process agent recovery, stop and data rollback passed. Executable ruleset/plugin installation remains disabled.";
  if (key==="freedoom") reason="Only the explicit Zandronum edition with the pinned Freedoom 2 IWAD is supported by this identity profile. Requires offline enrollment and a root-promoted engine/assets. Native query, restart and rollback passed; base/other Doom engines are excluded.";
  if (key==="factorio") reason="Requires offline enrollment and at least a 2 GiB memory allocation (1 GiB fails world generation under the address-space cap). Isolated start, protected backup/restore with a pre-restore copy, restart on the restored world, same-process agent recovery and stop passed on the VPS. In-game console control as the private UID is not yet verified.";
  if (key==="unvanquished") { isolation="blocked"; reason="Local identity candidate needs NaCl sandbox startup, recovery and snapshot acceptance before customer enrollment."; }
  if (["openra","openhv","earth-2140-trilogy","combined-arms","romanovs-vengeance","tiberian-dawn-hd","crystallized-nexus"].includes(key)) { isolation="blocked"; reason="Local typed engine-family candidate implemented; private .NET/AppImage startup, recovery and protected restore acceptance are required before enrollment."; }
  if (["openra","openhv","earth-2140-trilogy"].includes(key)) { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS (4 GiB envelope, 12 GiB address space). Protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="rimworld-together") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS with .NET GC limits. UID-aware controls, protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="space-station-14") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS (4 GiB envelope, net.port cvar). Protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="triplea") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS. Maps, protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="necesse") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS. Fenced world restore and customer control acceptance are still required before enrollment."; }
  if (key==="veloren") { isolation="blocked"; reason="Local pinned native/assets candidate with private world settings and metrics port implemented; cold world startup, graceful stop, recovery and restore acceptance remain required."; }
  if (key==="barotrauma") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS (writable runtime overlay, .NET GC limits). Protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="dont-starve-together") { isolation="blocked"; reason="Local pinned 64-bit native candidate with private cluster and fenced Steam ports implemented; startup, controls, recovery and restore acceptance remain required."; }
  if (key==="morrowind") { isolation="blocked"; reason="Isolated start, same-process agent restart, stop and migration rollback passed on the VPS (Lua libraries pinned, config path fixed, own-port UDP self-test allowed by a reviewed firewall rule). Fenced world restore and customer control acceptance are still required before enrollment."; }
  if (["team-fortress-2","counter-strike-2"].includes(key)) { isolation="blocked"; reason="Local native 64-bit Source candidate with pinned depots and private config/log overlays implemented; storage publication, startup, RCON, recovery and restore acceptance remain required."; }
  if (key==="team-fortress-2") { isolation="blocked"; reason="Isolated start with the pinned 14 GiB depot bundle, A2S query, same-process agent restart, stop and migration rollback passed on the VPS. RCON, protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="trackmania") { isolation="blocked"; reason="Isolated start with a Nadeo dedicated-server account, map load, same-process agent restart, stop and migration rollback passed on the VPS. Each server still needs its own customer-supplied dedicated-server account; protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="unturned") { isolation="blocked"; reason="Local pinned Unity candidate with namespace-only private Servers binding and private GSLT implemented; startup, Unity data-path behavior, console, recovery and restore acceptance remain required."; }
  if (key==="bombsquad") { isolation="blocked"; reason="Local paired Python/controller namespace candidate implemented; the previous isolated transport startup failed. Native transport, controller shutdown, recovery and restore acceptance remain required. Do not enroll customers."; }
  if (Object.hasOwn(PENDING_BOUNDARIES,key)) reason=PENDING_BOUNDARIES[key];
  if (key==="counter-strike-source") { isolation="blocked"; reason="Isolated start inside the per-UID AppArmor profile (i386 socketcall admitted only there), port bind, same-process agent restart, stop and migration rollback passed on the VPS. RCON, protected restore and customer control acceptance are still required before enrollment."; }
  if (key==="open-fortress") { isolation="blocked"; reason="A disposable root-command fixture binds UDP and TCP under AppArmor, seccomp, cgroup, bind-port and host-network policy. Managed-room startup, query, restart, controls and protected restore remain unverified. Customer enrollment stays blocked."; }
  if (key==="battlefield-1942-anthology") { isolation="blocked"; reason="Isolated start inside the per-UID AppArmor profile (i386 socketcall admitted only there), sealed stock settings, same-process agent restart, stop and migration rollback passed on the VPS. Protected restore and customer control acceptance are still required before enrollment."; }
  let contentReason="Plugin and Workshop installation remains disabled until this game's tenant boundary and its content source/compatibility/rollback path pass acceptance.";
  if (key === "re-volt-rvgl") {
    isolation = "operator_rollout";
    reason = "Fresh private-UID provisioning, root-managed lobby start, live capture/navigation, same-process agent restart and stop passed on the VPS. Enrollment requires an explicit tier selection. A complete race remains unverified; RVGL has no world-data backup support or enforced lobby player cap.";
  }
  if (key === "core-keeper") {
    // PlayBound exposes no in-game console/RCON for Core Keeper: customers get
    // typed settings (ServerConfig.json) and start/stop/restart, all exercised
    // by the accepted run. The earlier "UID-aware controls" gate named
    // controls this game does not have.
    isolation = "operator_rollout";
    reason = "Requires offline enrollment with its per-UID AppArmor display policy loaded. Isolated root-managed start, native query, same-process agent-restart adoption, stop and saved-world restore passed on the VPS. Core Keeper has no in-game console controls; settings and lifecycle controls are what customers get.";
  }
  if (key==="luanti") contentReason="Executable mods remain disabled: the pinned LuaJIT engine predates GHSA-g596-mf82-w8c3's fix. Engine mitigation/upgrade and content acceptance are required.";
  if (Object.hasOwn(RESTORE_ACCEPTED,key)) {
    isolation = "operator_rollout";
    reason = "Requires offline enrollment. Isolated start, protected backup/restore with a pre-restore copy, restart on the restored data, same-process agent recovery and stop passed on the VPS (2026-10-30). In-game console control as the private UID is not yet verified." + RESTORE_ACCEPTED[key];
  }
  return {isolation,identityProfile:profile||null,reason,executableContentEnabled:false,contentReason};
}
