"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { teamSizeLabel } from "@/lib/events/types";

export type RosterPerson = { userId: string; username: string };
export type RosterTeam = {
  id: string;
  name: string;
  captainUserId: string;
  members: RosterPerson[];
};

export function EventRoster({
  eventId,
  eventType,
  people,
  teams = [],
  teamSize = 1,
  isAdmin = false,
  registered = false,
}: {
  eventId: string;
  eventType: string;
  people: RosterPerson[];
  teams?: RosterTeam[];
  teamSize?: number;
  isAdmin?: boolean;
  registered?: boolean;
}) {
  const { status: authStatus, data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id || null;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTournament = eventType === "tournament";
  const usesTeams = isTournament && teamSize > 1;
  const myTeam = userId
    ? teams.find((t) => t.members.some((m) => m.userId === userId))
    : null;

  async function act(body: Record<string, unknown>) {
    if (authStatus !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(`/events/${eventId}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/tournament`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          {isTournament ? "Registered" : "Who's going"}
        </h2>
        {isTournament ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {teamSizeLabel(teamSize)}
            {usesTeams ? ` · ${teams.filter((t) => t.members.length >= teamSize).length} full teams` : ""}
          </span>
        ) : null}
      </div>

      {usesTeams ? (
        <ul className="space-y-3">
          {teams.length === 0 ? (
            <li className="text-sm text-muted-foreground">No teams yet. Register, then create one.</li>
          ) : (
            teams.map((t) => {
              const open = t.members.length < teamSize;
              return (
                <li key={t.id} className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {t.name}{" "}
                      <span className="text-xs font-medium text-muted-foreground">
                        {t.members.length}/{teamSize}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {registered && !myTeam && open ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act({ action: "join_team", teamId: t.id })}
                          className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          Join
                        </button>
                      ) : null}
                      {myTeam?.id === t.id ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act({ action: "leave_team" })}
                          className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
                        >
                          Leave team
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act({ action: "kick", teamId: t.id })}
                          className="rounded-full border border-destructive/40 px-3 py-1 text-xs font-semibold text-destructive"
                        >
                          Kick team
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.members.map((m) => m.username).join(", ") || "Empty"}
                  </p>
                </li>
              );
            })
          )}
        </ul>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nobody registered yet.</li>
          ) : (
            people.map((p) => (
              <li
                key={p.userId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm"
              >
                <Link href={`/users/${encodeURIComponent(p.username)}`} className="font-semibold hover:underline">
                  {p.username}
                </Link>
                {isAdmin && isTournament ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ action: "kick", userId: p.userId })}
                    className="text-xs font-semibold text-destructive"
                  >
                    Kick
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}

      {usesTeams && registered && !myTeam ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "create_team", name });
            setName("");
          }}
        >
          <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
            <span className="font-semibold">Create a team</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team name"
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Create
          </button>
        </form>
      ) : null}

      {usesTeams && people.some((p) => !teams.some((t) => t.members.some((m) => m.userId === p.userId))) ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Unteamed
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {people
              .filter((p) => !teams.some((t) => t.members.some((m) => m.userId === p.userId)))
              .map((p) => (
                <li key={p.userId} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm">
                  <Link href={`/users/${encodeURIComponent(p.username)}`} className="font-semibold hover:underline">
                    {p.username}
                  </Link>
                  {isAdmin && isTournament ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act({ action: "kick", userId: p.userId })}
                      className="text-xs font-semibold text-destructive"
                    >
                      Kick
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
