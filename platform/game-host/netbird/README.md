# Self-hosted NetBird for PlayBound Connect

The overlay behind Connect's `virtual-lan` mode, on our own VPS. Background and
the code that talks to it: [`docs/playbound-connect.md`](../../../docs/playbound-connect.md).

Self-hosted rather than NetBird's cloud because the cloud free tier caps devices
and the paid tiers charge per device — a per-player cost on a platform whose whole
premise is free games.

## Order of operations

Each step depends on the one before it. Doing them out of order mostly produces a
management server that will not issue a certificate.

### 1. DNS — do this first and let it propagate

`netbird.playbound.club` currently resolves only to the apex AAAA record. It needs
an **A record pointing at the VPS** (`147.93.133.235`), and no AAAA of its own
unless the VPS actually serves IPv6 — a stale AAAA will win the lookup and the
Let's Encrypt HTTP challenge will fail against nothing.

Confirm before continuing:

```bash
dig +short A netbird.playbound.club
```

### 2. Ports

NetBird needs these open inbound. **Never touch 22 while doing it** — a bad ufw
rule on a remote box is how you lose the box.

| Port | Protocol | What for |
|---|---|---|
| 80 | TCP | Let's Encrypt HTTP challenge |
| 443 | TCP | Management API and dashboard |
| 33073 | TCP | Management gRPC |
| 10000 | TCP | Signal service |
| 3478 | UDP | STUN/TURN |
| 49152–65535 | UDP | TURN relay range |

```bash
ufw allow 80/tcp comment netbird
ufw allow 443/tcp comment netbird
ufw allow 33073/tcp comment netbird
ufw allow 10000/tcp comment netbird
ufw allow 3478/udp comment netbird
ufw allow 49152:65535/udp comment netbird-turn
ufw status numbered
```

### 3. NetBird itself

Follow the upstream quickstart:

<https://docs.netbird.io/selfhosted/selfhosted-quickstart>

Run `getting-started.sh` in a dedicated directory. It bundles NetBird's embedded
Dex-based identity provider and provisions TLS via Let's Encrypt. You will set
an admin account during setup.

### 4. A service user and token

In the dashboard, create a **service user** and give it a **personal access
token**. That token is what both the site and the reflector authenticate with.
Do not use your own admin user's token — rotating your password should not take
down parties.

### 5. Join the VPS to the overlay

The reflector has to be a peer on the same overlay it mirrors across:

```bash
netbird up --management-url https://netbird.playbound.club
```

### 6. An infra group holding this peer

Create a group — `playbound-infra` — and put the VPS peer in it. Copy its group
ID into `NETBIRD_INFRA_GROUP_ID` on Vercel. Every party policy then includes
that group, which is what lets the reflector see the discovery traffic it
forwards. Without it parties still form and unicast still works; only discovery
fails.

### 7. Route the broadcast address to this peer

This is the step that makes discovery reach the reflector at all. In **Network
Routes**, advertise the segment's broadcast address from the VPS peer.

Take it from an enrolled client rather than assuming: whatever `ip | ~mask` comes
out of the overlay interface's own address and prefix is the address the games
send to, so that is what has to route here. A `/32` for exactly that address is
enough.

### 8. The reflector

```bash
cd /opt/playbound/platform/game-host/netbird
sudo bash install-reflector.sh
sudo nano /etc/playbound/reflector.env   # put the real token in
sudo systemctl start playbound-reflector
sudo journalctl -u playbound-reflector -f
```

### 9. Vercel

| Variable | Value |
|---|---|
| `NETBIRD_API_URL` | `https://netbird.playbound.club/api` |
| `NETBIRD_API_TOKEN` | the service-user token from step 4 |
| `NETBIRD_INFRA_GROUP_ID` | the group ID from step 6 |

Until all three are set, `provisionPartyLan` no-ops and parties behave exactly as
they did before — nothing breaks, virtual LAN just does nothing.

## Troubleshoot: `NetBird 404` on Ready / Join Game

Symptom in the party UI: after Ready (Beyond All Reason self-host defaults to
the overlay), LAN status fails with **NetBird 404**.

Check from any machine:

```bash
curl -sI -H 'Accept: application/json' https://netbird.playbound.club/api/groups
```

- **Good:** `401`/`403` JSON (API is up; token missing/wrong is fine for this probe).
- **Bad:** `404` with `content-type: text/html` — the reverse proxy is sending
  `/api/*` to the **dashboard** Next.js app instead of the **management**
  service. Dashboard on `/` can look healthy while every party provision fails.

Fix the compose/proxy so `/api` → management and `/` → dashboard, then recreate
the proxy container. Until that is fixed, PlayBound cannot create groups, policies,
or setup keys.

Failed provisions emit `party_lan_failed` telemetry and open/bump an Admin bug
report automatically.

## Verifying it actually works

Nothing above proves anything. The test that does, from two machines on
different networks, both with HoloCure's PlayBound edition installed:

1. Party up, both members click **Join Game**
2. Both should report being on the party network, naming the adapter
3. In game on each: **Play → Multiplayer → use saved network adapter**
4. Leader: **Host LAN Session**. Everyone else: **Join LAN Session**
5. The host's session should appear in the client's list within a few seconds

Watch `journalctl -u playbound-reflector -f` while step 5 runs. Forwarded
packets appear there. If nothing arrives, step 7's route is wrong — that is the
most likely thing to be wrong, and the easiest to misconfigure silently.

Discovering each other is not the same as playing. Confirm a run actually
starts and stays in sync before calling it done.
