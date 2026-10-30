import test from "node:test";
import assert from "node:assert/strict";
import { INSTALLATION_TARGETS } from "./installationTargets.js";
import { hostingReadiness } from "./hostingReadiness.js";

test("every installation reports tenant/content readiness separately from update support",()=>{
  for (const key of Object.keys(INSTALLATION_TARGETS)) {
    const value=hostingReadiness(key);
    assert.ok(["operator_rollout","blocked","pending"].includes(value.isolation));
    assert.ok(value.reason.length>30);
    assert.doesNotMatch(value.reason,/human Join/i,`${key} must not require a staged player Join`);
    assert.ok(value.contentReason.length>30);
    assert.equal(value.executableContentEnabled,false);
  }
  for (const key of ["constructor","__proto__","../other"]) assert.throws(()=>hostingReadiness(key));
});
test("isolated engine implementations cannot claim automatic enrollment or safe executable content",()=>{
  assert.equal(hostingReadiness("0ad").identityProfile,"0-ad-unix-v1");
  assert.equal(hostingReadiness("flightgear").isolation,"operator_rollout");
  assert.equal(hostingReadiness("supertuxkart").isolation,"operator_rollout");
  assert.equal(hostingReadiness("hurry-curry").identityProfile,"hurry-curry-unix-v1");
  assert.match(hostingReadiness("hurry-curry").reason,/UID-aware controls/);
  assert.match(hostingReadiness("luanti").contentReason,/GHSA/);
  assert.equal(hostingReadiness("counter-strike-2").isolation,"blocked");
});

test("Factorio is operator rollout after protected-restore acceptance, with its memory floor stated",()=>{
  const value=hostingReadiness("factorio");
  assert.equal(value.isolation,"operator_rollout");
  assert.equal(value.executableContentEnabled,false);
  assert.match(value.reason,/2 GiB/);
  assert.match(value.reason,/restore/);
});

test("Unvanquished is operator rollout only with the per-UID AppArmor profile",()=>{assert.equal(hostingReadiness("unvanquished").isolation,"operator_rollout");assert.match(hostingReadiness("unvanquished").reason,/AppArmor profile loaded/);assert.equal(hostingReadiness("unvanquished").executableContentEnabled,false);});


test("OpenRA spin-off editions are accepted against their own mods",()=>{
  for(const key of ["combined-arms","romanovs-vengeance","tiberian-dawn-hd","crystallized-nexus"]){
    assert.equal(hostingReadiness(key).isolation,"operator_rollout",key);
    assert.equal(hostingReadiness(key).executableContentEnabled,false,key);
    assert.ok(hostingReadiness(key).identityProfile,key);
  }
});

test("games that passed protected-restore acceptance are operator rollout, never executable content",()=>{
  for(const key of ["openra","openhv","earth-2140-trilogy","rimworld-together","space-station-14","triplea","necesse","barotrauma","morrowind","veloren"]){
    const value=hostingReadiness(key);
    assert.equal(value.isolation,"operator_rollout",key);
    assert.equal(value.executableContentEnabled,false,key);
    assert.match(value.reason,/restore/,key);
    assert.match(value.reason,/console control as the private UID is not yet verified/,key);
  }
});


test("DST candidate stays blocked before cluster acceptance",()=>{assert.equal(hostingReadiness("dont-starve-together").isolation,"blocked");assert.equal(hostingReadiness("dont-starve-together").executableContentEnabled,false);});

test("new native family candidates cannot claim accepted isolation",()=>{
  for(const game of ["dont-starve-together","counter-strike-2","unturned"]){
    const value=hostingReadiness(game);
    assert.equal(value.isolation,"blocked",game);
    assert.equal(value.identityProfile,`${game}-unix-v1`);
    assert.equal(value.executableContentEnabled,false);
    assert.match(value.reason,/acceptance/);
  }
});

test("unimplemented legacy/display/special supervisors have explicit limitations",()=>{
  for(const game of ["goldeneye-source","deus-ex","aneurism-iv"]){
    const value=hostingReadiness(game);
    assert.equal(value.isolation,"pending",game);
    assert.equal(value.identityProfile,null);
    assert.equal(value.executableContentEnabled,false);
    assert.match(value.reason,/Wine|32-bit|Xvfb|shared service/);
  }
  const bombsquad=hostingReadiness("bombsquad");
  assert.equal(bombsquad.isolation,"operator_rollout");
  assert.match(bombsquad.reason,/no world data/);
});

test("Core Keeper is operator rollout: lifecycle and settings are its only controls", () => {
  const value = hostingReadiness("core-keeper");
  assert.equal(value.identityProfile, "core-keeper-unix-v1");
  assert.equal(value.isolation, "operator_rollout");
  assert.equal(value.executableContentEnabled, false);
  assert.doesNotMatch(value.reason, /Human Join/i);
  assert.match(value.reason, /AppArmor display policy/);
  assert.match(value.reason, /no in-game console/);
});

test("RVGL identity is available for explicit operator rollout after fresh lifecycle acceptance", () => {
  const value = hostingReadiness("re-volt-rvgl");
  assert.equal(value.identityProfile,"re-volt-rvgl-unix-v1");
  assert.equal(value.isolation,"operator_rollout");
  assert.equal(value.executableContentEnabled,false);
  assert.match(value.reason,/Fresh private-UID provisioning/);
  assert.doesNotMatch(value.reason,/human Join/i);
});

test("TF2 is operator rollout with RCON verified and no world backups", () => {
  const value = hostingReadiness("team-fortress-2");
  assert.equal(value.isolation, "operator_rollout");
  assert.equal(value.executableContentEnabled, false);
  assert.match(value.reason, /RCON .*answered as the private UID/);
  assert.match(value.reason, /no world data/);
});

test("guarded i386 Source-family games are operator rollout only with the per-UID AppArmor profile", () => {
  for (const key of ["counter-strike-source", "open-fortress", "battlefield-1942-anthology"]) {
    const value = hostingReadiness(key);
    assert.equal(value.isolation, "operator_rollout", key);
    assert.equal(value.executableContentEnabled, false, key);
    assert.match(value.reason, /per-UID AppArmor profile loaded/, key);
    assert.match(value.reason, /no world data/, key);
  }
  for (const key of ["counter-strike-source", "open-fortress"]) assert.match(hostingReadiness(key).reason, /RCON .*answered as the private UID/, key);
});

test("Trackmania is operator rollout with its per-server Nadeo account stated", () => {
  const value = hostingReadiness("trackmania");
  assert.equal(value.isolation, "operator_rollout");
  assert.equal(value.executableContentEnabled, false);
  assert.match(value.reason, /Nadeo dedicated-server account/);
  assert.match(value.reason, /restore/);
});
