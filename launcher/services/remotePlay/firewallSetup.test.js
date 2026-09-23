"use strict";

const assert = require("assert");
const { firewallScript } = require("./firewallSetup");

const script = firewallScript("C:\\Program Files\\PlayBound\\PlayBound.exe", "C:\\Program Files\\PlayBound\\sunshine.exe");
assert.match(script, /-RemoteAddress LocalSubnet/);
assert.match(script, /-Profile Private,Public/);
assert.match(script, /-Program \$rule.Program/);
assert.match(script, /47998/);
assert.match(script, /5353/);
assert.match(script, /47984,47989,48010/);
assert.match(script, /47998-48000/);
assert.doesNotMatch(script, /-RemoteAddress Any/);
assert.doesNotMatch(script, /-Direction Outbound/);
console.log("remote play firewall setup scope ok");
