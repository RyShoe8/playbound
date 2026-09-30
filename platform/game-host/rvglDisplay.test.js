import test from "node:test";
import assert from "node:assert/strict";
import { rvglDisplayForPort, validateRvglInput } from "./rvglDisplay.js";

test("RVGL display is tied to its allocated room port", () => {
  assert.deepEqual(rvglDisplayForPort(2310), {
    display: ":2310", authFile: "/var/lib/playbound-host/rvgl-displays/2310.xauth",
  });
  assert.throws(() => rvglDisplayForPort(1234));
  assert.throws(() => rvglDisplayForPort(2310.5));
});

test("lobby input permits bounded clicks and navigation only", () => {
  assert.deepEqual(validateRvglInput({ type: "click", x: 639, y: 479 }), { type: "click", x: 639, y: 479 });
  assert.deepEqual(validateRvglInput({ type: "key", key: "Return" }), { type: "key", key: "Return" });
  for (const input of [
    { type: "click", x: -1, y: 2 },
    { type: "click", x: 640, y: 1 },
    { type: "click", x: 2.5, y: 4 },
    { type: "key", key: "Ctrl+Alt+Delete" },
    { type: "key", key: "a;touch /tmp/pwned" },
    null,
  ]) assert.throws(() => validateRvglInput(input));
});
