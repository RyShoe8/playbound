"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Participant = {
  id: string;
  userId: string | null;
  teamId?: string | null;
  label: string;
  state: string;
  seed: number | null;
};

type Match = {
  id: string;
  round: number;
  matchNumber: number;
  participantAId: string | null;
  participantBId: string | null;
  status: string;
  winnerParticipantId: string | null;
  scoreA: number | null;
  scoreB: number | null;
};

export function TournamentBracket({
  eventId,
  format,
  teamSize = 1,
  participants,
  matches,
  isAdmin = false,
}: {
  eventId: string;
  format: string;
  teamSize?: number;
  participants: Participant[];
  matches: Match[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const byId = new Map(participants.map((p) => [p.id, p]));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});

  function label(pid: string | null) {
    if (!pid) return "TBD";
    return byId.get(pid)?.label || "TBD";
  }

  async function act(body: Record<string, unknown>) {
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
        setError(data.error || "Could not update bracket");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update bracket");
    } finally {
      setBusy(false);
    }
  }

  function scoreFor(m: Match) {
    return scores[m.id] || {
      a: m.scoreA != null ? String(m.scoreA) : "",
      b: m.scoreB != null ? String(m.scoreB) : "",
    };
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          Bracket
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold capitalize text-muted-foreground">
            {format.replace(/_/g, " ")} · {participants.length}{" "}
            {teamSize > 1 ? "teams" : "players"}
          </span>
          {isAdmin ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act({ action: "generate_bracket" })}
              className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {matches.length ? "Regenerate bracket" : "Generate bracket"}
            </button>
          ) : null}
        </div>
      </div>

      {!matches.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {isAdmin
            ? teamSize > 1
              ? "Generate the bracket once at least two full teams have registered."
              : "Generate the bracket once at least two people have registered."
            : "Bracket not generated yet."}
        </p>
      ) : (
        <div className="mt-4 space-y-6 overflow-x-auto">
          {rounds.map((round) => (
            <div key={round}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Round {round}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {matches
                  .filter((m) => m.round === round)
                  .map((m) => {
                    const s = scoreFor(m);
                    const canScore =
                      isAdmin &&
                      m.status !== "completed" &&
                      m.participantAId &&
                      m.participantBId;
                    return (
                      <div
                        key={m.id}
                        className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={
                              m.winnerParticipantId === m.participantAId
                                ? "font-bold text-primary"
                                : ""
                            }
                          >
                            {label(m.participantAId)}
                            {m.scoreA != null ? ` (${m.scoreA})` : ""}
                          </span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {m.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span
                            className={
                              m.winnerParticipantId === m.participantBId
                                ? "font-bold text-primary"
                                : ""
                            }
                          >
                            {label(m.participantBId)}
                            {m.scoreB != null ? ` (${m.scoreB})` : ""}
                          </span>
                        </div>
                        {canScore ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={s.a}
                              onChange={(e) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...s, a: e.target.value },
                                }))
                              }
                              className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                              aria-label="Score A"
                            />
                            <span className="text-xs text-muted-foreground">–</span>
                            <input
                              type="number"
                              min={0}
                              value={s.b}
                              onChange={(e) =>
                                setScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...s, b: e.target.value },
                                }))
                              }
                              className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                              aria-label="Score B"
                            />
                            <button
                              type="button"
                              disabled={busy || !m.participantAId}
                              onClick={() =>
                                void act({
                                  action: "complete_match",
                                  matchId: m.id,
                                  winnerParticipantId: m.participantAId,
                                  scoreA: s.a === "" ? null : Number(s.a),
                                  scoreB: s.b === "" ? null : Number(s.b),
                                })
                              }
                              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
                            >
                              A wins
                            </button>
                            <button
                              type="button"
                              disabled={busy || !m.participantBId}
                              onClick={() =>
                                void act({
                                  action: "complete_match",
                                  matchId: m.id,
                                  winnerParticipantId: m.participantBId,
                                  scoreA: s.a === "" ? null : Number(s.a),
                                  scoreB: s.b === "" ? null : Number(s.b),
                                })
                              }
                              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold"
                            >
                              B wins
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
