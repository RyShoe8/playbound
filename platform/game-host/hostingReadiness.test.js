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
  assert.match(hostingReadiness("hurry-curry").reason,/unknown/);
  assert.match(hostingReadiness("luanti").contentReason,/GHSA/);
  assert.equal(hostingReadiness("counter-strike-2").isolation,"pending");
});
