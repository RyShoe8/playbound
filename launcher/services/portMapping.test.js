/**
 * Parsing and protocol-encoding tests for portMapping.
 *
 * These cover the parts that are pure and therefore worth asserting on: real
 * SSDP/SOAP payloads from consumer gateways, and the NAT-PMP byte layout from
 * RFC 6886. The socket work around them is exercised by actually running a
 * discovery against the local network, which is a manual check rather than a
 * test, since a CI box has no router to answer.
 */

const assert = require("assert");
const {
  parseSsdpLocation,
  parseWanService,
  resolveControlUrl,
  buildSoapBody,
  parseSoapValue,
  parseSoapError,
  buildNatPmpMapRequest,
  parseNatPmpMapResponse,
  parseNatPmpExternalIp,
  isPrivateIPv4,
} = require("./portMapping");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

console.log("portMapping");

/* ── SSDP ── */

test("parses the LOCATION header regardless of case", () => {
  const response =
    "HTTP/1.1 200 OK\r\n" +
    "CACHE-CONTROL: max-age=120\r\n" +
    "location: http://192.168.1.1:5000/rootDesc.xml\r\n" +
    "SERVER: Linux/3.4 UPnP/1.0\r\n\r\n";
  assert.strictEqual(parseSsdpLocation(response), "http://192.168.1.1:5000/rootDesc.xml");
});

test("returns null when there is no LOCATION header", () => {
  assert.strictEqual(parseSsdpLocation("HTTP/1.1 200 OK\r\n\r\n"), null);
  assert.strictEqual(parseSsdpLocation(""), null);
  assert.strictEqual(parseSsdpLocation(null), null);
});

/* ── device description ── */

const DEVICE_XML = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType>
        <controlURL>/ctl/L3F</controlURL>
      </service>
    </serviceList>
    <deviceList><device><serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType>
        <controlURL>/ctl/IPConn</controlURL>
      </service>
    </serviceList></device></deviceList>
  </device>
</root>`;

test("picks the WAN connection service, not the first service listed", () => {
  const service = parseWanService(DEVICE_XML);
  assert.strictEqual(service.serviceType, "urn:schemas-upnp-org:service:WANIPConnection:1");
  assert.strictEqual(service.controlUrl, "/ctl/IPConn");
});

test("accepts the PPP variant that DSL gateways expose", () => {
  const xml = DEVICE_XML.replace("WANIPConnection:1", "WANPPPConnection:1");
  assert.strictEqual(
    parseWanService(xml).serviceType,
    "urn:schemas-upnp-org:service:WANPPPConnection:1"
  );
});

test("returns null when no WAN service is present", () => {
  const xml = `<root><device><serviceList><service>
    <serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType>
    <controlURL>/ctl/L3F</controlURL>
  </service></serviceList></device></root>`;
  assert.strictEqual(parseWanService(xml), null);
  assert.strictEqual(parseWanService(""), null);
});

test("resolves a host-relative controlURL against the device location", () => {
  assert.strictEqual(
    resolveControlUrl("http://192.168.1.1:5000/rootDesc.xml", "/ctl/IPConn"),
    "http://192.168.1.1:5000/ctl/IPConn"
  );
});

test("leaves an absolute controlURL alone", () => {
  assert.strictEqual(
    resolveControlUrl("http://192.168.1.1:5000/rootDesc.xml", "http://10.0.0.1/ctl"),
    "http://10.0.0.1/ctl"
  );
});

/* ── SOAP ── */

test("builds an AddPortMapping envelope with the arguments in order", () => {
  const body = buildSoapBody("urn:x:service:WANIPConnection:1", "AddPortMapping", {
    NewExternalPort: 1234,
    NewProtocol: "UDP",
  });
  assert.ok(body.includes('SOAPAction') === false, "body must not carry the header");
  assert.ok(body.includes("<u:AddPortMapping xmlns:u=\"urn:x:service:WANIPConnection:1\">"));
  assert.ok(body.includes("<NewExternalPort>1234</NewExternalPort>"));
  assert.ok(body.includes("<NewProtocol>UDP</NewProtocol>"));
});

test("escapes XML metacharacters in argument values", () => {
  const body = buildSoapBody("urn:x", "AddPortMapping", {
    NewPortMappingDescription: 'PlayBound <"Game" & co>',
  });
  assert.ok(body.includes("PlayBound &lt;&quot;Game&quot; &amp; co&gt;"));
  assert.ok(!body.includes('<"Game"'));
});

test("reads a value out of a SOAP response", () => {
  const xml =
    '<s:Envelope><s:Body><u:GetExternalIPAddressResponse>' +
    "<NewExternalIPAddress>203.0.113.7</NewExternalIPAddress>" +
    "</u:GetExternalIPAddressResponse></s:Body></s:Envelope>";
  assert.strictEqual(parseSoapValue(xml, "NewExternalIPAddress"), "203.0.113.7");
});

test("detects a SOAP fault and its UPnP error code", () => {
  const xml =
    "<s:Envelope><s:Body><s:Fault><detail><UPnPError>" +
    "<errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription>" +
    "</UPnPError></detail></s:Fault></s:Body></s:Envelope>";
  const fault = parseSoapError(xml);
  assert.strictEqual(fault.code, 725);
  assert.strictEqual(fault.description, "OnlyPermanentLeasesSupported");
});

test("a successful response is not a fault", () => {
  assert.strictEqual(parseSoapError("<s:Envelope><s:Body><ok/></s:Body></s:Envelope>"), null);
});

/* ── NAT-PMP (RFC 6886) ── */

test("encodes a UDP map request in the RFC byte layout", () => {
  const buf = buildNatPmpMapRequest({ internalPort: 1234, externalPort: 1234, protocol: "udp", lifetime: 3600 });
  assert.strictEqual(buf.length, 12);
  assert.strictEqual(buf.readUInt8(0), 0, "version");
  assert.strictEqual(buf.readUInt8(1), 1, "opcode 1 = UDP");
  assert.strictEqual(buf.readUInt16BE(4), 1234, "internal port");
  assert.strictEqual(buf.readUInt16BE(6), 1234, "suggested external port");
  assert.strictEqual(buf.readUInt32BE(8), 3600, "lifetime");
});

test("uses opcode 2 for TCP", () => {
  assert.strictEqual(buildNatPmpMapRequest({ internalPort: 80, protocol: "tcp" }).readUInt8(1), 2);
});

test("defaults the external port to the internal one", () => {
  const buf = buildNatPmpMapRequest({ internalPort: 6567, protocol: "udp" });
  assert.strictEqual(buf.readUInt16BE(6), 6567);
});

test("parses a successful map response", () => {
  const buf = Buffer.alloc(16);
  buf.writeUInt8(0, 0);
  buf.writeUInt8(129, 1);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt32BE(12345, 4);
  buf.writeUInt16BE(1234, 8);
  buf.writeUInt16BE(4321, 10);
  buf.writeUInt32BE(3600, 12);
  const parsed = parseNatPmpMapResponse(buf);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.internalPort, 1234);
  assert.strictEqual(parsed.externalPort, 4321, "gateway may assign a different external port");
  assert.strictEqual(parsed.lifetime, 3600);
});

test("reports a non-zero NAT-PMP result code as failure", () => {
  const buf = Buffer.alloc(16);
  buf.writeUInt16BE(2, 2); // 2 = network failure
  const parsed = parseNatPmpMapResponse(buf);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.resultCode, 2);
});

test("rejects a truncated NAT-PMP response instead of misreading it", () => {
  assert.strictEqual(parseNatPmpMapResponse(Buffer.alloc(4)), null);
  assert.strictEqual(parseNatPmpMapResponse(null), null);
});

test("parses the external address out of an opcode-0 response", () => {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(0, 2);
  buf[8] = 203;
  buf[9] = 0;
  buf[10] = 113;
  buf[11] = 7;
  assert.strictEqual(parseNatPmpExternalIp(buf), "203.0.113.7");
});

/* ── address classification ── */

test("classifies private and public IPv4 correctly", () => {
  for (const ip of ["10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.1", "127.0.0.1", "169.254.1.1"]) {
    assert.strictEqual(isPrivateIPv4(ip), true, `${ip} should be private`);
  }
  for (const ip of ["203.0.113.7", "8.8.8.8", "172.32.0.1", "172.15.0.1"]) {
    assert.strictEqual(isPrivateIPv4(ip), false, `${ip} should be public`);
  }
});

test("treats CGNAT space as unusable for hosting", () => {
  // A 100.64/10 address is a carrier NAT; a mapping there is not reachable.
  assert.strictEqual(isPrivateIPv4("100.64.0.1"), true);
  assert.strictEqual(isPrivateIPv4("100.127.255.254"), true);
  assert.strictEqual(isPrivateIPv4("100.63.0.1"), false, "just below the CGNAT range is public");
  assert.strictEqual(isPrivateIPv4("100.128.0.1"), false, "just above the CGNAT range is public");
});

test("treats malformed input as private rather than assuming it is routable", () => {
  for (const ip of ["", null, "not-an-ip", "1.2.3", "1.2.3.4.5", "999.1.1.1"]) {
    assert.strictEqual(isPrivateIPv4(ip), true);
  }
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll portMapping tests passed.");
