import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CUSTOMER_IDENTITY_GAMES, CUSTOMER_IDENTITY_PROFILES, CUSTOMER_IDENTITY_PORTS, supportsCustomerIdentity, supportsCustomerIdentityProfile } from "./customerIdentityProfiles.js";
import { installationKey } from "./installationTargets.js";
import { hostingReadiness } from "./hostingReadiness.js";
import { customerResourceLimits } from "./customerResourceLimits.js";

const source = name => fs.readFileSync(new URL(name, import.meta.url), "utf8");
test("implemented identities have installation, resource, readiness and root port contracts", () => {
  const runtime = source("./tools/customer-runtime.py");
  const migration = source("./tools/customer-data-migration.py");
  const resources = source("./tools/customer-resources.py");
  for (const game of CUSTOMER_IDENTITY_GAMES) {
    assert.ok(installationKey(game), game);
    assert.equal(hostingReadiness(installationKey(game)).identityProfile, `${game}-unix-v1`);
    assert.ok(customerResourceLimits(game).memoryMiB >= 256);
    const match = runtime.match(new RegExp(String.raw`'${game}': \('([^']+)',\s*(\d+),\s*(\d+)\)`));
    assert.ok(match, `Missing root runtime contract: ${game}`);
    assert.deepEqual(CUSTOMER_IDENTITY_PORTS[game], [Number(match[2]), Number(match[3])]);
    assert.ok(migration.includes(`'${game}':'${match[1]}'`), `Migration data namespace mismatch: ${game}`);
    assert.ok(resources.includes(`'${game}': (`), `Missing root allocation policy: ${game}`);
  }
  assert.equal(new Set(CUSTOMER_IDENTITY_GAMES).size, CUSTOMER_IDENTITY_GAMES.length);
  assert.equal(CUSTOMER_IDENTITY_PROFILES.length, CUSTOMER_IDENTITY_GAMES.length);
  assert.ok(Object.isFrozen(CUSTOMER_IDENTITY_PORTS));
  for (const ports of Object.values(CUSTOMER_IDENTITY_PORTS)) assert.ok(Object.isFrozen(ports));
});
test("unknown identities remain rejected even when installations exist", () => {
  for (const game of ["constructor", "__proto__", "../terraria", "aneurism-iv"]) {
    assert.equal(supportsCustomerIdentity(game), false);
    assert.equal(supportsCustomerIdentityProfile(`${game}-unix-v1`), false);
    assert.throws(() => customerResourceLimits(game));
  }
  for (const value of [undefined, null, {}, "terraria-unix-v2"]) assert.equal(supportsCustomerIdentityProfile(value), false);
  assert.match(source("./install.sh"), /AGENT_SRC\/customerIdentityProfiles\.js/);
});
