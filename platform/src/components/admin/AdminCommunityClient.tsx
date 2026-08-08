"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Report = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
};

type TopicRef = {
  id: string;
  title: string;
  gameSlug: string;
  modSlug?: string | null;
  slug: string;
  status: string;
};
type Suspended = { id: string; username: string; email: string; until: string | null };
type Audit = {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  note: string | null;
  createdAt: string;
};

export function AdminCommunityClient({
  reports,
  removed,
  locked,
  suspended,
  audit,
}: {
  reports: Report[];
  removed: TopicRef[];
  locked: TopicRef[];
  suspended: Suspended[];
  audit: Audit[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function resolveReport(id: string, status: "resolved" | "dismissed") {
    setBusy(id);
    await fetch("/api/admin/community/reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBusy("");
    router.refresh();
  }

  async function moderate(id: string, action: string) {
    setBusy(id + action);
    await fetch(`/api/admin/community/topics/${id}/moderate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy("");
    router.refresh();
  }

  async function unsuspend(id: string) {
    setBusy(id);
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suspendedUntil: null }),
    });
    setBusy("");
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Reports ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open reports.</p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold">
                {r.targetType} · {r.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.targetId} · {new Date(r.createdAt).toLocaleString()}
              </p>
              {r.details && <p className="mt-2 text-muted-foreground">{r.details}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => resolveReport(r.id, "resolved")}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  Resolve
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => resolveReport(r.id, "dismissed")}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-bold"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Locked discussions</h2>
        {locked.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <Link
              href={
                t.modSlug
                  ? `/mods/${t.modSlug}/discussion/${t.slug}`
                  : `/games/${t.gameSlug}/discussion/${t.slug}`
              }
              className="font-semibold hover:text-primary"
            >
              {t.title}
            </Link>
            <button
              type="button"
              className="ml-3 text-xs font-semibold text-primary"
              onClick={() => moderate(t.id, "unlock")}
            >
              Unlock
            </button>
          </div>
        ))}
        {locked.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}

        <h2 className="pt-4 text-lg font-bold">Removed content</h2>
        {removed.map((t) => (
          <div key={t.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">{t.title}</p>
            <p className="text-xs text-muted-foreground">{t.gameSlug}</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary"
              onClick={() => moderate(t.id, "restore")}
            >
              Restore
            </button>
          </div>
        ))}
        {removed.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}

        <h2 className="pt-4 text-lg font-bold">Suspended users</h2>
        {suspended.map((u) => (
          <div key={u.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <p className="font-semibold">{u.username}</p>
            <p className="text-xs text-muted-foreground">
              Until {u.until ? new Date(u.until).toLocaleString() : "—"}
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-primary"
              onClick={() => unsuspend(u.id)}
            >
              Lift suspension
            </button>
          </div>
        ))}
        {suspended.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}

        <h2 className="pt-4 text-lg font-bold">Moderator audit log</h2>
        <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
          {audit.map((a) => (
            <div key={a.id} className="rounded border border-border px-2 py-1.5">
              <span className="font-semibold">{a.actorUsername}</span> {a.action} {a.targetType}{" "}
              {a.targetId.slice(-6)} · {new Date(a.createdAt).toLocaleString()}
              {a.note ? ` — ${a.note}` : ""}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
