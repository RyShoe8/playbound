# Customer game network isolation rollout

Production game network filters are **not enabled**. Teeworlds now has an explicit
operator-only managed profile, `public-game-v1`, on top of completed Unix identity
migration. Normal creation remains unchanged. Executable plugins remain disabled;
other hosted engines do not yet have this profile.

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

Before dropping privileges or attempting connections, the child queries its
**exact** scope's kernel ingress and egress BPF attachments. Both must exist;
parent-slice filters do not count. This inspection currently supports only the
reviewed x86_64 Linux syscall/query ABI and fails closed on another architecture.
The VPS returned one ingress and one egress program, then passed the connection
controls. Seven boundary tests cover missing hooks, syscall failure, wrong scopes,
unsupported architecture and verification before probing. CI mocks kernel calls;
the real operator preflight remains manual.

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

## Explicit managed profile

After the data migration and UID enrollment procedure in
[customer-identity-migration.md](customer-identity-migration.md), keep the agent and
both process identities offline and run as direct root:

```sh
/usr/local/libexec/playbound-customer-data-migration enable-network SERVER_ID
/usr/local/libexec/playbound-customer-data-migration disable-network SERVER_ID
```

These change only the root-owned migration journal, with actor/time. They require
an active verified migration, completed UID enrollment, one stopped Teeworlds job,
no retained room and the runtime lock. Enabling also requires the actual kernel
preflight above. They grant no agent-selected CIDR, unit or systemd-property path.
Disabling the network profile leaves UID enrollment intact and affects next start;
it never relaxes a running game's policy. Actual CLI paths/UID are fixed. Normal
website creation has no network toggle or implicit enrollment.

Before game execution, the root supervisor derives policy from the validated
journal and imports the fixed root-owned network helper. The helper can apply only
the fixed CIDRs to its **current customer scope**, then confirms both kernel BPF
hooks. Failure blocks execution. Status/recovery compare journal and runtime
binding, inspect that exact scope's hooks, and fail closed on missing/mismatched
policy. Saved room metadata retains the network profile for public-interface
queries after agent restart. Missing public host configuration yields unknown;
there is no fallback to a blocked local query or a fake empty count.

Managed VPS fixture acceptance verified public zero-player/four-slot queries,
same game PID after agent restart with kernel-hook revalidation, full scoped stop,
explicit disable without UID downgrade, and resume with normal loopback queries.
Saved fixture bytes were preserved and all temporary games/homes were removed.
The fixture used a second reserved legacy UID so production could remain live;
the real operator CLI always requires the old service UID offline.

## Remaining rollout gates

- Keep default launches unchanged. Approve a maintenance rollout only after
  client Join/occupied-count checks; no production profile is enrolled today.
- Verify public client Join, occupied counts, IPv6 if offered, DNS/master listing,
  callbacks and game-specific RCON. The current candidate blocks loopback, so a
  blanket rollout would break existing local adapters.
- Assess host administration ports, public-address access to other tenants,
  outbound abuse controls and abstract Unix sockets. CIDR filters alone do not
  establish complete network or executable-plugin isolation.
- Repeat engine-specific acceptance across the entire offered inventory before
  claiming all-game coverage. Keep unsupported profiles explicitly unavailable.
