# Customer game network isolation rollout

Production game network filters are **not enabled**. Executable plugins remain
disabled. This is the preflight and query-transport foundation for the next
opt-in managed-runtime profile, not a claim that all hosted engines are isolated.

## Manual kernel preflight

Installed operator helper, with no agent sudo permission or scheduled sampling:

```sh
/usr/local/libexec/playbound-customer-network-check probe
```

Run directly as root on the hosting node. It validates its fixed installation
and trusted parents, creates IPv4/IPv6 loopback control listeners, and confirms
unrestricted control connectivity. A unique transient scope then uses the fixed
candidate `IPAddressDeny` list. Its child drops supplementary groups and runs
as UID/GID 65534. It must be blocked from both control listeners while retaining
IPv4 TCP connectivity to the fixed public endpoint 1.1.1.1:443. No application
request or credentials are sent. A failed control or missing enforcement fails
preflight; there is no optimistic fallback. Sockets, child and scope are bounded
and cleaned up automatically. No existing unit or host firewall is changed.

The candidate list covers private IPv4, carrier-grade NAT, loopback, link-local/
metadata, multicast/reserved IPv4, IPv6 loopback, mapped IPv4, unique-local,
link-local and multicast. The preflight exercises **loopback controls**, not every
configured CIDR. It does not verify public IPv6 connectivity or human Join.

The implementation uses systemd's transient-unit resource controls. See the
[upstream transient settings](https://github.com/systemd/systemd/blob/main/docs/TRANSIENT-SETTINGS.md)
and [firewall implementation](https://github.com/systemd/systemd/blob/main/src/core/bpf-firewall.c).
Do not infer enforcement merely because systemd accepted a property.

## Verified query foundation

Teeworlds' existing agent query accepts an optional literal IPv4 host. Default
production queries still use loopback. Both handshake packets use the selected
host; responses from another address/port are ignored. Invalid endpoints and
timeouts return unknown, never zero players.

VPS checks compared loopback/public-interface queries against the existing
Teeworlds server: both reported zero players/eight slots. A separate fixture then
ran the reviewed Teeworlds binary under its reserved UID and namespace boundary,
with a candidate filtered transient service, 0.75 CPU, 1536 MiB RAM, zero swap,
128 tasks and a bounded lifetime. Loopback queries returned unknown; public
interface queries returned zero players/four slots. The fixture was removed.
No production process was filtered or moved. Public game-query traffic is not a
substitute for client Join or occupied-player validation.

## Remaining integration gates

- Declare and independently validate a fixed managed-runtime network profile;
  keep normal customer/community launches unchanged until its gates pass.
- Apply policy before engine execution, verify kernel enforcement and retain it
  through restart recovery. Unknown/unsupported enforcement must block launch.
- Persist profile enrollment without silently downgrading after stop/failure.
- Route that profile's queries through the verified public address, validated
  from existing host configuration. Never accept arbitrary client query targets.
- Verify public client Join, occupied counts, IPv6 if offered, DNS/master listing,
  callbacks and game-specific RCON. The current candidate blocks loopback, so a
  blanket rollout would break existing local adapters.
- Assess host administration ports, public-address access to other tenants,
  outbound abuse controls and abstract Unix sockets. CIDR filters alone do not
  establish complete network or executable-plugin isolation.
- Repeat engine-specific acceptance across the entire offered inventory before
  claiming all-game coverage. Keep unsupported profiles explicitly unavailable.
