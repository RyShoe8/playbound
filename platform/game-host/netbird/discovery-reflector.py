#!/usr/bin/env python3
"""
PlayBound Connect — LAN discovery reflector.

Some games find their friends by broadcasting on the local network and offer
no address to connect to. NetBird is WireGuard: it routes, it does not
replicate, so a packet addressed to the segment's broadcast address reaches
nobody and the two ends never learn about each other.

This daemon is the missing hop. NetBird routes the broadcast address here, we
receive those packets, and we re-send them to every other peer in the sender's
party — with the sender's own address as the source.

Preserving the source is the whole point. Taking HoloCure as the case we built
this for, its client identifies the host purely by the source address of the
reply it receives:

    both ends   bind(INADDR_ANY:27015) UDP
    client  ->  "From1" to (ip | ~mask), the subnet-directed broadcast
    host    ->  "From2" to its own subnet broadcast
    client      treats the SOURCE of that reply as the host, and connects

A reflector that forwarded with its own source address would tell every client
that the VPS is the host. So we build the IP header ourselves and put the
original sender in it. Everything after this handshake is ordinary unicast and
never comes through here.

Scope is enforced by group: a packet is only ever forwarded to peers sharing a
NetBird group with the sender, so one party's discovery cannot leak into
another's. Group membership comes from the NetBird API and is cached briefly.

Runs as root — raw sockets require it. Systemd unit alongside this file.
"""

import json
import os
import socket
import struct
import sys
import time
import urllib.error
import urllib.request

API_URL = os.environ.get("NETBIRD_API_URL", "").rstrip("/")
API_TOKEN = os.environ.get("NETBIRD_API_TOKEN", "")
LISTEN_PORT = int(os.environ.get("DISCOVERY_PORT", "27015"))
BIND_ADDR = os.environ.get("DISCOVERY_BIND", "0.0.0.0")
PEER_CACHE_TTL = float(os.environ.get("PEER_CACHE_TTL", "15"))
# Discovery payloads are tiny; anything larger is not ours to forward.
MAX_PAYLOAD = 512


def log(message):
    print(f"[reflector] {message}", flush=True)


def fetch_peers():
    """[(ip, {groupIds})] for every peer the account knows about."""
    req = urllib.request.Request(
        f"{API_URL}/peers",
        headers={"Authorization": f"Token {API_TOKEN}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        peers = json.loads(res.read().decode("utf-8"))

    out = []
    for peer in peers:
        ip = peer.get("ip")
        if not ip:
            continue
        groups = {g.get("id") for g in (peer.get("groups") or []) if g.get("id")}
        out.append((ip, groups))
    return out


class PeerDirectory:
    """
    Group membership, refreshed on a timer rather than per packet.

    Discovery retries every frame while a player sits on the multiplayer
    screen, so a lookup per packet would mean hammering the API. A few seconds
    of staleness costs at most a couple of retries.
    """

    def __init__(self, ttl):
        self.ttl = ttl
        self.fetched_at = 0.0
        self.peers = []

    def refresh_if_stale(self):
        if time.time() - self.fetched_at < self.ttl:
            return
        try:
            self.peers = fetch_peers()
            self.fetched_at = time.time()
        except (urllib.error.URLError, ValueError, TimeoutError) as err:
            # Keep serving the old list — a blip in the API should not stop
            # players who are already mid-handshake.
            log(f"peer refresh failed, using cached list: {err}")
            self.fetched_at = time.time() - (self.ttl / 2)

    def targets_for(self, source_ip):
        """Peers sharing at least one group with the sender, excluding it."""
        self.refresh_if_stale()
        source_groups = set()
        for ip, groups in self.peers:
            if ip == source_ip:
                source_groups |= groups
        if not source_groups:
            return []
        return [
            ip
            for ip, groups in self.peers
            if ip != source_ip and (groups & source_groups)
        ]


class TrafficLog:
    """
    A periodic line saying what arrived and what happened to it.

    Silence used to be ambiguous. A reflector receiving nothing and a reflector
    receiving packets it cannot place look identical in the journal, and they
    have completely different causes — the first is a missing NetBird route,
    the second is a peer outside the party's group. Discovery retries every
    frame, so this summarises on a timer instead of logging per packet.
    """

    def __init__(self, interval=30.0):
        self.interval = interval
        self.reported_at = time.time()
        self.received = 0
        self.forwarded = 0
        self.unplaceable = set()

    def seen(self, src_ip, target_count):
        self.received += 1
        if target_count:
            self.forwarded += target_count
        else:
            self.unplaceable.add(src_ip)
        now = time.time()
        if now - self.reported_at < self.interval:
            return
        self.reported_at = now
        detail = ""
        if self.unplaceable:
            senders = ", ".join(sorted(self.unplaceable)[:5])
            detail = (
                f"; {len(self.unplaceable)} sender(s) shared no group with anyone "
                f"({senders}) — check NETBIRD_INFRA_GROUP_ID and the party policy"
            )
        log(f"{self.received} packet(s) in, {self.forwarded} forwarded{detail}")
        self.received = 0
        self.forwarded = 0
        self.unplaceable.clear()


def checksum(data):
    if len(data) % 2:
        data += b"\x00"
    total = 0
    for i in range(0, len(data), 2):
        total += (data[i] << 8) + data[i + 1]
    total = (total >> 16) + (total & 0xFFFF)
    total += total >> 16
    return ~total & 0xFFFF


def build_packet(src_ip, dst_ip, src_port, dst_port, payload):
    """
    A complete IPv4 + UDP datagram with a chosen source address.

    The UDP checksum is left zero, which IPv4 explicitly permits and every
    receiver we care about accepts; the IP header checksum is mandatory and is
    computed here.
    """
    udp_len = 8 + len(payload)
    udp = struct.pack("!HHHH", src_port, dst_port, udp_len, 0) + payload

    total_len = 20 + udp_len
    ip = struct.pack(
        "!BBHHHBBH4s4s",
        0x45,                      # version 4, 5-word header
        0,                         # DSCP / ECN
        total_len,
        0,                         # id — the kernel does not fill this with IP_HDRINCL
        0,                         # flags / fragment offset
        64,                        # TTL
        socket.IPPROTO_UDP,
        0,                         # checksum placeholder
        socket.inet_aton(src_ip),
        socket.inet_aton(dst_ip),
    )
    ip = ip[:10] + struct.pack("!H", checksum(ip)) + ip[12:]
    return ip + udp


def main():
    if not API_URL or not API_TOKEN:
        log("NETBIRD_API_URL and NETBIRD_API_TOKEN are required")
        return 2

    try:
        raw = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_RAW)
        raw.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
    except PermissionError:
        log("raw sockets need root — run this as root")
        return 2

    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind((BIND_ADDR, LISTEN_PORT))

    directory = PeerDirectory(PEER_CACHE_TTL)
    stats = TrafficLog()
    log(f"listening on {BIND_ADDR}:{LISTEN_PORT}, management {API_URL}")
    log(
        "if nothing is logged below while players sit on a multiplayer screen, "
        "the segment's broadcast address is not routed to this peer — see step 7 "
        "of netbird/README.md"
    )

    while True:
        try:
            payload, (src_ip, src_port) = listener.recvfrom(MAX_PAYLOAD)
        except OSError as err:
            log(f"receive failed: {err}")
            continue
        if not payload:
            continue

        targets = directory.targets_for(src_ip)
        stats.seen(src_ip, len(targets))
        if not targets:
            # Either an unknown peer or a party of one. Nothing to mirror to.
            continue

        for dst_ip in targets:
            try:
                packet = build_packet(src_ip, dst_ip, src_port, LISTEN_PORT, payload)
                raw.sendto(packet, (dst_ip, LISTEN_PORT))
            except OSError as err:
                log(f"forward to {dst_ip} failed: {err}")


if __name__ == "__main__":
    sys.exit(main() or 0)
