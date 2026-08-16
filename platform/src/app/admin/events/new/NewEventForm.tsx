"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewEventForm({
  gameOptions,
}: {
  gameOptions: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("game_night");
  const [gameSlug, setGameSlug] = useState("");
  const [editionSlug, setEditionSlug] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [discordInviteUrl, setDiscordInviteUrl] = useState("");
  const [tournamentFormat, setTournamentFormat] = useState("single_elim");
  const [teamSize, setTeamSize] = useState("1");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const timezone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim(),
          eventType,
          gameSlug: gameSlug || null,
          editionSlug: editionSlug || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          timezone,
          maxParticipants:
            eventType === "tournament"
              ? null
              : maxParticipants
                ? Number(maxParticipants)
                : null,
          discordInviteUrl: discordInviteUrl || null,
          status: "registration_open",
          ...(eventType === "tournament"
            ? {
                tournamentFormat,
                teamSize: Number(teamSize) || 1,
                checkInRequired: true,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        router.push(data?.event?.id ? `/events/${data.event.id}` : "/events");
        router.refresh();
      } else {
        setState("error");
        setMessage(data?.error ?? "Something went wrong.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Type</span>
        <PremiumSelect
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="w-full"
        >
          <option value="game_night">Game Night</option>
          <option value="tournament">Tournament</option>
          <option value="party">Party</option>
        </PremiumSelect>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Game</span>
        <PremiumSelect
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          className="w-full"
        >
          <option value="">No game linked</option>
          {gameOptions.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </PremiumSelect>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Edition slug (optional)</span>
        <input
          value={editionSlug}
          onChange={(e) => setEditionSlug(e.target.value)}
          placeholder="official"
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Starts</span>
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Ends (optional)</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Times are in your local timezone. Everyone else sees them in theirs.
      </p>
      {eventType !== "tournament" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Capacity (optional)</span>
          <input
            type="number"
            min={1}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
          />
        </label>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Discord invite override (optional)</span>
        <input
          value={discordInviteUrl}
          onChange={(e) => setDiscordInviteUrl(e.target.value)}
          placeholder="https://discord.gg/…"
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
        />
      </label>
      {eventType === "tournament" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Format</span>
            <PremiumSelect
              value={tournamentFormat}
              onChange={(e) => setTournamentFormat(e.target.value)}
              className="w-full"
            >
              <option value="single_elim">Single elimination</option>
              <option value="double_elim">Double elimination</option>
              <option value="round_robin">Round robin</option>
              <option value="ffa">Free-for-all</option>
            </PremiumSelect>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Team size</span>
            <input
              type="number"
              min={1}
              max={16}
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2"
            />
          </label>
        </div>
      ) : null}
      {state === "error" ? (
        <p className="text-sm text-destructive">{message}</p>
      ) : null}
      <button
        type="submit"
        disabled={state === "busy"}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {state === "busy" ? "Publishing…" : "Publish event"}
      </button>
    </form>
  );
}
