"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { Check, Clock, Gamepad2, Mail, Search, UserPlus } from "lucide-react";
import { useFriendsStore } from "@/stores/friendsStore";

type Result = {
  id: string;
  username: string;
  image?: string | null;
  friendStatus: "none" | "friends" | "outgoing_request" | "incoming_request" | "blocked";
  sharedGames?: string[];
  sharedCount?: number;
};

type Mode = "username" | "players" | "email";

/**
 * Adding friends: username search, library discover, or email invite.
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
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

  async function sendEmailInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      setInviteMsg("");
      return;
    }
    setBusy(true);
    setError("");
    setInviteMsg("");
    try {
      const res = await fetch("/api/friends/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send invite.");
        return;
      }
      setInviteMsg(data?.message ?? "Invite sent.");
      setInviteEmail("");
      if (data?.mode === "existing") {
        const { fetchRequests } = useFriendsStore.getState();
        void fetchRequests();
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
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
        setInviteMsg("");
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
        {tab("email", "Invite by email")}
      </div>

      {mode === "username" ? (
        <form onSubmit={searchByUsername} className="mt-3 flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            aria-label="Username"
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
      ) : mode === "players" ? (
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
      ) : (
        <form onSubmit={sendEmailInvite} className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Invite someone to PlayBound by email. If they already have an account, we’ll send a friend
            request.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              aria-label="Email"
              className={field}
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <Mail className="size-4" /> Send invite
            </button>
          </div>
          {inviteMsg ? <p className="text-sm text-play">{inviteMsg}</p> : null}
        </form>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {busy && mode !== "email" && (
        <p className="mt-3 text-sm text-muted-foreground">Searching…</p>
      )}

      {!busy && results?.length === 0 && mode !== "email" && (
        <p className="mt-3 text-sm text-muted-foreground">
          {mode === "username"
            ? "Nobody matched that."
            : "Nobody else has that in their library yet."}
        </p>
      )}

      {!busy && results && results.length > 0 && mode !== "email" && (
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <li
              key={String(u.id)}
              className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  <a href={`/users/${encodeURIComponent(u.username)}`} className="hover:underline">
                    {u.username}
                  </a>
                </p>
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
