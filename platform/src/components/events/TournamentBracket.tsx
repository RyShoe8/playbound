import Link from "next/link";

type Participant = {
  id: string;
  userId: string | null;
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
  format,
  participants,
  matches,
}: {
  format: string;
  participants: Participant[];
  matches: Match[];
}) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  function label(pid: string | null) {
    if (!pid) return "TBD";
    const p = byId.get(pid);
    if (!p) return "TBD";
    return p.userId ? `Player ${p.userId.slice(-4)}` : p.id.slice(-4);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          Bracket
        </h2>
        <span className="text-xs font-semibold capitalize text-muted-foreground">
          {format.replace(/_/g, " ")} · {participants.length} players
        </span>
      </div>

      {!matches.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Bracket not generated yet. Registered players will appear after check-in.
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
                  .map((m) => (
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
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {participants.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Field
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {participants.map((p) => (
              <li
                key={p.id}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold capitalize"
              >
                {p.userId ? (
                  <Link href={`/users`} className="pointer-events-none">
                    {p.state.replace(/_/g, " ")}
                  </Link>
                ) : (
                  p.state
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
