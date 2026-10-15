import { test } from "node:test";
import assert from "node:assert/strict";
import { verifiedIdentityMigration, identityMigrationMetadata } from "./customerMigration.js";

const id = "0123456789abcdef01234567";
test("migration proof uses only the fixed helper, clean environment and matching root response", () => {
  assert.equal(verifiedIdentityMigration(id, "/var/lib/playbound-host", (binary, args, options) => {
    assert.equal(binary, "/usr/bin/sudo");
    assert.deepEqual(args, ["-n", "/usr/local/libexec/playbound-customer-runtime", "migration", id]);
    assert.deepEqual(options.env, { PATH: "/usr/bin:/usr/games", LANG: "C.UTF-8" });
    assert.equal(options.timeout, 4000);
    return JSON.stringify({ serverId: id, migrationReady: true });
  }), true);
});
test("missing, failed, mismatched or untrusted migration proof never permits enrollment", () => {
  for (const response of ["not json", "{}", JSON.stringify({ serverId: "another", migrationReady: true }), JSON.stringify({ serverId: id, migrationReady: "true" }), JSON.stringify({ serverId: id, migrationReady: false })]) {
    assert.equal(verifiedIdentityMigration(id, "/var/lib/playbound-host", () => response), false);
  }
  assert.equal(verifiedIdentityMigration(id, "/var/lib/playbound-host", () => { throw new Error("timeout"); }), false);
  const forbidden = () => { assert.fail("invalid input must not invoke sudo"); };
  assert.equal(verifiedIdentityMigration("../id", "/var/lib/playbound-host", forbidden), false);
  assert.equal(verifiedIdentityMigration(id, "/tmp/other-home", forbidden), false);
});
test("network enrollment comes only from a validated root-owned migration response", () => {
  assert.deepEqual(identityMigrationMetadata(id, "/var/lib/playbound-host", () => JSON.stringify({ serverId: id, migrationReady: true, networkProfile: "public-game-v1" })), { networkProfile: "public-game-v1" });
  assert.equal(identityMigrationMetadata(id, "/var/lib/playbound-host", () => JSON.stringify({ serverId: id, migrationReady: true, networkProfile: "arbitrary" })), null);
});
