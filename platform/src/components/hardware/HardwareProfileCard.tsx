"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTelemetry } from "@/lib/telemetry";

type ProfileView = {
  collectedAt: string;
  updatedAt?: string | null;
  os: { family?: string; name?: string | null; version?: string | null; arch?: string };
  cpu: {
    displayName?: string | null;
    cores?: number | null;
    threads?: number | null;
    tier?: string;
  };
  gpus: Array<{ displayName?: string | null; vramMB?: number | null }>;
  primaryGpuIndex: number | null;
  memory: { totalMB?: number | null };
  storage?: {
    installDrive?: { freeMB?: number | null; type?: string | null; mount?: string | null } | null;
  };
  detectionErrors?: string[];
};

function formatRam(mb?: number | null) {
  if (mb == null) return "Unknown";
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

function relativeDay(iso?: string | null) {
  if (!iso) return "Unknown";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Unknown";
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function HardwareProfileCard() {
  const { track } = useTelemetry();
  const [profile, setProfile] = useState<ProfileView | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hardware/profile");
        if (cancelled) return;
        if (res.status === 401) {
          setProfile(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setProfile(data.profile ?? null);
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeProfile() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/hardware/profile", { method: "DELETE" });
      if (!res.ok) {
        setMsg("Couldn’t delete hardware profile.");
        return;
      }
      setProfile(null);
      setMsg("Hardware profile removed.");
    } catch {
      setMsg("Couldn’t reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (profile === undefined) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">Your Gaming PC</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-tight">Your Gaming PC</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open the PlayBound launcher while signed in to automatically check games against your PC.
          Hardware details stay private to your account.
        </p>
        <Link
          href="/launcher"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Get the launcher
        </Link>
        {msg ? <p className="mt-2 text-xs text-muted-foreground">{msg}</p> : null}
      </section>
    );
  }

  const gpuIdx = profile.primaryGpuIndex ?? 0;
  const gpu = profile.gpus[gpuIdx] || profile.gpus[0];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-extrabold tracking-tight">Your Gaming PC</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Last checked: {relativeDay(profile.collectedAt)}. Not shown on your public profile.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CPU</dt>
          <dd className="mt-0.5 text-sm font-semibold">{profile.cpu.displayName || "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GPU</dt>
          <dd className="mt-0.5 text-sm font-semibold">{gpu?.displayName || "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memory</dt>
          <dd className="mt-0.5 text-sm font-semibold">{formatRam(profile.memory.totalMB)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operating System
          </dt>
          <dd className="mt-0.5 text-sm font-semibold capitalize">
            {[profile.os.name || profile.os.family, profile.os.version].filter(Boolean).join(" ") ||
              "Unknown"}
          </dd>
        </div>
      </dl>

      <details
        className="mt-4"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) {
            track("hardware_details_expanded", {});
          }
        }}
      >
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          Advanced details
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>
            Arch: {profile.os.arch || "unknown"} · CPU tier: {profile.cpu.tier || "unknown"}
          </li>
          {profile.cpu.cores ? (
            <li>
              Cores/threads: {profile.cpu.cores}
              {profile.cpu.threads ? ` / ${profile.cpu.threads}` : ""}
            </li>
          ) : null}
          {gpu?.vramMB ? <li>VRAM: {formatRam(gpu.vramMB)}</li> : null}
          {profile.gpus.length > 1 ? (
            <li>
              GPUs detected:{" "}
              {profile.gpus.map((g) => g.displayName || "Unknown").join(", ")}
            </li>
          ) : null}
          {profile.storage?.installDrive?.mount ? (
            <li>
              Install drive {profile.storage.installDrive.mount}:{" "}
              {formatRam(profile.storage.installDrive.freeMB)} free
              {profile.storage.installDrive.type
                ? ` (${profile.storage.installDrive.type})`
                : ""}
            </li>
          ) : null}
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/launcher"
          className="inline-flex h-10 items-center rounded-full border border-border bg-secondary px-5 text-sm font-bold hover:bg-secondary/70"
        >
          Refresh in launcher
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void removeProfile()}
          className="h-10 rounded-full border border-border px-5 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-60"
        >
          {busy ? "Removing…" : "Delete profile"}
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs text-muted-foreground">{msg}</p> : null}
    </section>
  );
}
