"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { Check, Clock, Gamepad2, Search, UserPlus } from "lucide-react";
import { useFriendsStore } from "@/stores/friendsStore";

type Result = {
  id: string;
  username: string;
  image?: string | null;
  friendStatus: "none" | "friends" | "outgoing_request" | "incoming_request" | "blocked";
  sharedGames?: string[];
  sharedCount?: number;
};

type Mode = "username" | "players";

/**
 * Adding friends, two ways.
 *
 * Both modes render the same result rows because the discover endpoint returns
 * the same shape and status vocabulary as the username search — the only
 * difference is what was asked, not what comes back.
 */
export function AddFriends({
  games,
  genres,
}: {
  games: { slug: string; title: string }[];
  genres: string[];
}) {
  const sendFriendRequest = useFriendsStore((s) => s.sendRequest);
  const [mode, setMode] = useState<Mode>("username");
  const [username, setUsername] = useState("");
  const [game, setGame] = useState("");
  const [genre, setGenre] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  async function run(url: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Search failed");
        setResults([]);
        return;
      }
      setResults(data.users ?? []);
    } catch {
      setError("Couldn't reach the server.");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  function searchByUsername(e: React.FormEvent) {
    e.preventDefault();
    const q = username.trim();
    if (q.length < 3) {
      setError("Enter at least 3 characters.");
      setResults(null);
      return;
    }
    void run(`/api/friends/search?q=${encodeURIComponent(q)}`);
  }

  function findPlayers(e: React.FormEvent) {
    e.preventDefault();
    if (!game && !genre) {
      setError("Pick a game or a genre.");
      setResults(null);
      return;
    }
    const params = game ? `game=${encodeURIComponent(game)}` : `genre=${encodeURIComponent(genre)}`;
    void run(`/api/friends/discover?${params}`);
  }

  async function sendRequest(targetUserId: string) {
    setSent((s) => ({ ...s, [targetUserId]: true }));
    setError("");
    const result = await sendFriendRequest(targetUserId);
    if (!result.success) {
      setError(result.error ?? "Couldn't send that request.");
      setSent((s) => ({ ...s, [targetUserId]: false }));
      return;
    }
    setResults((prev) =>
      prev
        ? prev.map((u) =>
            String(u.id) === targetUserId ? { ...u, friendStatus: "outgoing_request" } : u
          )
        : prev
    );
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(value);
        setResults(null);
        setError("");
      }}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
        mode === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  const field =
    "h-9 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-bold">Add friends</h2>
        {tab("username", "By username")}
        {tab("players", "Find players")}
      </div>

      {mode === "username" ? (
        <form onSubmit={searchByUsername} className="mt-3 flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username or email"
            aria-label="Username or email"
            className={field}
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <Search className="size-4" /> Search
          </button>
        </form>
      ) : (
        <form onSubmit={findPlayers} className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Find people with a game in their library, or anyone playing a genre.
          </p>
          <div className="flex flex-wrap gap-2">
            <PremiumSelect
              value={game}
              onChange={(e) => {
                setGame(e.target.value);
                if (e.target.value) setGenre("");
              }}
              className={`${field} flex-1 min-w-[10rem]`}
              aria-label="Game"
            >
              <option value="">Any game…</option>
              {games.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.title}
                </option>
              ))}
            </PremiumSelect>
            <PremiumSelect
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value);
                if (e.target.value) setGame("");
              }}
              className={`${field} flex-1 min-w-[10rem]`}
              aria-label="Genre"
            >
              <option value="">Any genre…</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </PremiumSelect>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <Gamepad2 className="size-4" /> Find
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {busy && <p className="mt-3 text-sm text-muted-foreground">Searching…</p>}

      {!busy && results?.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {mode === "username"
            ? "Nobody matched that."
            : "Nobody else has that in their library yet."}
        </p>
      )}

      {!busy && results && results.length > 0 && (
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <li
              key={String(u.id)}
              className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.username}</p>
                {u.sharedGames && u.sharedGames.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {u.sharedGames.join(", ")}
                    {(u.sharedCount ?? 0) > u.sharedGames.length &&
                      ` +${(u.sharedCount ?? 0) - u.sharedGames.length} more`}
                  </p>
                )}
              </div>
              <RequestButton
                status={u.friendStatus}
                pending={Boolean(sent[String(u.id)])}
                onClick={() => void sendRequest(String(u.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestButton({
  status,
  pending,
  onClick,
}: {
  status: Result["friendStatus"];
  pending: boolean;
  onClick: () => void;
}) {
  const chip = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold";

  if (status === "friends") {
    return (
      <span className={`${chip} text-muted-foreground`}>
        <Check className="size-3.5" /> Friends
      </span>
    );
  }
  if (status === "incoming_request") {
    return <span className={`${chip} text-primary`}>Wants to be friends</span>;
  }
  if (status === "outgoing_request" || pending) {
    return (
      <span className={`${chip} text-muted-foreground`}>
        <Clock className="size-3.5" /> Requested
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${chip} bg-primary text-primary-foreground`}>
      <UserPlus className="size-3.5" /> Add
    </button>
  );
}
