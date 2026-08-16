"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Image as ImageIcon } from "lucide-react";

export function NewEventForm({
  gameOptions,
}: {
  gameOptions: { slug: string; title: string; coverImage?: string | null }[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("game_night");
  const [gameSlug, setGameSlug] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [discordInviteUrl, setDiscordInviteUrl] = useState("");
  const [tournamentFormat, setTournamentFormat] = useState("single_elim");
  const [teamSize, setTeamSize] = useState("1");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedGame = gameOptions.find((g) => g.slug === gameSlug);
  const effectiveCover = coverImage || selectedGame?.coverImage || null;

  async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/events/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setCoverImage(data.url);
      } else {
        setMessage(data.error || "Failed to upload cover image.");
      }
    } catch {
      setMessage("Failed to upload cover image.");
    } finally {
      setUploadingCover(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
          coverImage: coverImage || null,
          editionSlug: null,
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
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
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
          placeholder="e.g. TF2 Classic Friday Night"
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
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
          placeholder="Match details, rules, voice chat channels, or schedule…"
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
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

      {/* Cover Photo Upload & Preview */}
      <div className="space-y-2 text-sm">
        <span className="font-semibold flex items-center gap-1.5">
          <ImageIcon className="size-4 text-primary" /> Cover Photo{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </span>

        {effectiveCover ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-card/80">
            <div className="relative h-40 w-full">
              <img
                src={effectiveCover}
                alt="Event cover preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground drop-shadow">
                  {coverImage
                    ? "Custom cover photo uploaded"
                    : `Using ${selectedGame?.title || "game"} cover photo`}
                </span>
                {coverImage && (
                  <button
                    type="button"
                    onClick={() => setCoverImage(null)}
                    className="flex items-center gap-1 rounded-md bg-destructive/80 px-2 py-1 text-destructive-foreground backdrop-blur-sm transition-colors hover:bg-destructive"
                  >
                    <X className="size-3" /> Remove Custom
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={uploadingCover}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            {uploadingCover
              ? "Uploading…"
              : coverImage
                ? "Change Cover Photo"
                : "Upload Cover Photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverFileChange}
          />
          {!coverImage && selectedGame?.coverImage && (
            <span className="text-xs text-muted-foreground">
              Defaults to game cover if not provided.
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Starts</span>
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Ends (optional)</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
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
            className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
          />
        </label>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Discord invite override (optional)</span>
        <input
          value={discordInviteUrl}
          onChange={(e) => setDiscordInviteUrl(e.target.value)}
          placeholder="https://discord.gg/…"
          className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
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
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground"
            />
          </label>
        </div>
      ) : null}
      {state === "error" || message ? (
        <p className="text-sm text-destructive">{message}</p>
      ) : null}
      <button
        type="submit"
        disabled={state === "busy" || uploadingCover}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
      >
        {state === "busy" ? "Publishing…" : "Publish event"}
      </button>
    </form>
  );
}
