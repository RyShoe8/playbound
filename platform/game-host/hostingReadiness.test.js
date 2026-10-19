import test from "node:test";
import assert from "node:assert/strict";
import { INSTALLATION_TARGETS } from "./installationTargets.js";
import { hostingReadiness } from "./hostingReadiness.js";

test("every installation reports tenant/content readiness separately from update support",()=>{
  for (const key of Object.keys(INSTALLATION_TARGETS)) {
    const value=hostingReadiness(key);
    assert.ok(["operator_rollout","blocked","pending"].includes(value.isolation));
    assert.ok(value.reason.length>30);
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

test("Factorio candidate cannot be advertised as accepted isolation",()=>{
  assert.equal(hostingReadiness("factorio").isolation,"blocked");
  assert.equal(hostingReadiness("factorio").executableContentEnabled,false);
  assert.match(hostingReadiness("factorio").reason,/acceptance/);
});

test("Unvanquished candidate stays blocked before fenced NaCl acceptance",()=>{assert.equal(hostingReadiness("unvanquished").isolation,"blocked");assert.equal(hostingReadiness("unvanquished").executableContentEnabled,false);});


test("seven OpenRA engine-family candidates remain blocked until runtime acceptance",()=>{
  for(const key of ["openra","openhv","combined-arms","earth-2140-trilogy","romanovs-vengeance","tiberian-dawn-hd","crystallized-nexus"]){
    assert.equal(hostingReadiness(key).isolation,"blocked",key);
    assert.equal(hostingReadiness(key).executableContentEnabled,false,key);
    assert.ok(hostingReadiness(key).identityProfile,key);
  }
});

test("new .NET identity candidates cannot be enrolled as accepted",()=>{for(const key of ["rimworld-together","space-station-14"]){assert.equal(hostingReadiness(key).isolation,"blocked");assert.equal(hostingReadiness(key).executableContentEnabled,false);}});

test("TripleA Java25 candidate stays blocked pending runtime acceptance",()=>{assert.equal(hostingReadiness("triplea").isolation,"blocked");assert.equal(hostingReadiness("triplea").executableContentEnabled,false);});

test("Necesse paired-Java candidate stays blocked pending runtime acceptance",()=>{assert.equal(hostingReadiness("necesse").isolation,"blocked");assert.equal(hostingReadiness("necesse").executableContentEnabled,false);});

test("Veloren native/assets candidate stays blocked pending world acceptance",()=>{assert.equal(hostingReadiness("veloren").isolation,"blocked");assert.equal(hostingReadiness("veloren").executableContentEnabled,false);});

test("Barotrauma candidate remains blocked before engine acceptance",()=>{assert.equal(hostingReadiness("barotrauma").isolation,"blocked");assert.equal(hostingReadiness("barotrauma").executableContentEnabled,false);});

test("DST candidate stays blocked before cluster acceptance",()=>{assert.equal(hostingReadiness("dont-starve-together").isolation,"blocked");assert.equal(hostingReadiness("dont-starve-together").executableContentEnabled,false);});

test("new native family candidates cannot claim accepted isolation",()=>{
  for(const game of ["barotrauma","dont-starve-together","morrowind","team-fortress-2","counter-strike-2","trackmania","unturned"]){
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
  assert.equal(bombsquad.isolation,"blocked");
  assert.match(bombsquad.reason,/transport startup failed/);
});

test("Core Keeper handoff stays blocked after isolated lifecycle acceptance", () => {
  const value = hostingReadiness("core-keeper");
  assert.equal(value.identityProfile, "core-keeper-unix-v1");
  assert.equal(value.isolation, "blocked");
  assert.equal(value.executableContentEnabled, false);
  assert.match(value.reason, /Human Join/);
  assert.match(value.reason, /UID-aware controls/);
});

test("RVGL identity is available for explicit operator rollout after fresh lifecycle acceptance", () => {
  const value = hostingReadiness("re-volt-rvgl");
  assert.equal(value.identityProfile,"re-volt-rvgl-unix-v1");
  assert.equal(value.isolation,"operator_rollout");
  assert.equal(value.executableContentEnabled,false);
  assert.match(value.reason,/Fresh private-UID provisioning/);
  assert.match(value.reason,/human Join/);
});
