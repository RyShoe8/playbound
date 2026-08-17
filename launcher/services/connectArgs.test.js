/**
 * Plain-launch argument handling.
 *
 * Clicking Play with no server to join used to pass any connect-arg element
 * that had no placeholder in it. That splits flag/value pairs: Unvanquished's
 * ["+connect", "{host}:{port}"] became a bare `+connect`, and the engine
 * rejected it — `URL "+connect" contains forbidden character '+'` — so the
 * game never started. Twelve hosted games have that shape and only survived
 * because their engines ignore a dangling flag.
 *
 * Run: node services/connectArgs.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CLIENT_CONNECT_ARGS,
  applyConnectTemplates,
  staticLaunchArgs,
} = require("./connectArgs");

test("a templated pair contributes nothing to a plain launch", () => {
  // The reported case.
  assert.deepEqual(staticLaunchArgs(["+connect", "{host}:{port}"]), []);
  // Same shape, different engines.
  assert.deepEqual(staticLaunchArgs(["-n", "{host}:{port}"]), []);
  assert.deepEqual(staticLaunchArgs(["--host", "{host}:{port}"]), []);
  assert.deepEqual(
    staticLaunchArgs(["--go", "--address", "{host}", "--port", "{port}"]),
    []
  );
});

test("genuinely static args still apply", () => {
  // P99's patchme: no placeholder anywhere, so it is a real launch flag.
  assert.deepEqual(staticLaunchArgs(["patchme"]), ["patchme"]);
  assert.deepEqual(staticLaunchArgs(["-windowed", "-novid"]), ["-windowed", "-novid"]);
});

test("empty and missing inputs are safe", () => {
  assert.deepEqual(staticLaunchArgs(null), []);
  assert.deepEqual(staticLaunchArgs(undefined), []);
  assert.deepEqual(staticLaunchArgs([]), []);
  assert.deepEqual(staticLaunchArgs("+connect"), []);
});

test("no shipped connect list leaks a flag into a plain launch", () => {
  // Every entry in the table is a join line; none should survive a plain Play.
  for (const [slug, templates] of Object.entries(CLIENT_CONNECT_ARGS)) {
    if (!Array.isArray(templates)) continue;
    assert.deepEqual(
      staticLaunchArgs(templates),
      [],
      `${slug} would pass ${JSON.stringify(staticLaunchArgs(templates))} on a plain launch`
    );
  }
});

test("joining still substitutes the address", () => {
  assert.deepEqual(
    applyConnectTemplates(["+connect", "{host}:{port}"], { host: "1.2.3.4", port: 27960 }),
    ["+connect", "1.2.3.4:27960"]
  );
  assert.deepEqual(
    applyConnectTemplates(["--go", "--address", "{host}", "--port", "{port}"], {
      host: "10.0.0.5",
      port: 30000,
    }),
    ["--go", "--address", "10.0.0.5", "--port", "30000"]
  );
});

test("every shipped list resolves to a complete join line", () => {
  for (const [slug, templates] of Object.entries(CLIENT_CONNECT_ARGS)) {
    if (!Array.isArray(templates)) continue;
    const args = applyConnectTemplates(templates, { host: "1.2.3.4", port: 1234 });
    assert.equal(args.length, templates.length, `${slug} lost an argument`);
    for (const a of args) {
      assert.ok(!/\{(host|port|name)\}/.test(a), `${slug} left a placeholder in ${a}`);
    }
  }
});
