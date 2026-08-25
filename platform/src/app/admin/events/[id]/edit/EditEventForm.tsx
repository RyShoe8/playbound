"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Image as ImageIcon } from "lucide-react";

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type EditEventInitialValues = {
  title: string;
  description: string;
  eventType: string;
  gameSlug: string;
  coverImage: string | null;
  startsAt: string;
  endsAt: string;
  maxParticipants: number | null;
  discordInviteUrl: string;
  featured: boolean;
  visibility: string;
  status: string;
  tournamentFormat: string | null;
  teamSize: number;
};

export function EditEventForm({
  eventId,
  initialValues,
  gameOptions,
}: {
  eventId: string;
  initialValues: EditEventInitialValues;
  gameOptions: { slug: string; title: string; coverImage?: string | null }[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialValues.title);
  const [description, setDescription] = useState(initialValues.description);
  const [eventType, setEventType] = useState(initialValues.eventType);
  const [gameSlug, setGameSlug] = useState(initialValues.gameSlug);
  const [coverImage, setCoverImage] = useState<string | null>(initialValues.coverImage);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [startsAt, setStartsAt] = useState(toLocalDatetimeInput(initialValues.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalDatetimeInput(initialValues.endsAt));

  useEffect(() => {
    if (initialValues.startsAt) {
      setStartsAt(toLocalDatetimeInput(initialValues.startsAt));
    }
    if (initialValues.endsAt) {
      setEndsAt(toLocalDatetimeInput(initialValues.endsAt));
    }
  }, [initialValues.startsAt, initialValues.endsAt]);
  const [maxParticipants, setMaxParticipants] = useState(
    initialValues.maxParticipants != null ? String(initialValues.maxParticipants) : ""
  );
  const [discordInviteUrl, setDiscordInviteUrl] = useState(initialValues.discordInviteUrl);
  const [featured, setFeatured] = useState(initialValues.featured);
  const [visibility, setVisibility] = useState(initialValues.visibility);
  const [status, setStatus] = useState(initialValues.status);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
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
    setMessage("");
    try {
      const timezone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description: description.trim(),
          eventType,
          gameSlug: gameSlug || null,
          coverImage: coverImage || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          timezone,
          maxParticipants: maxParticipants ? Number(maxParticipants) : null,
          discordInviteUrl: discordInviteUrl || null,
          featured,
          visibility,
          status,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setState("saved");
        setMessage("Event updated.");
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

  const inputCls =
    "w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-foreground";

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
          className={inputCls}
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
          className={inputCls}
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
            className={inputCls}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Ends (optional)</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Times are in your local timezone. Everyone else sees them in theirs.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Status</span>
          <PremiumSelect
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="registration_open">Registration Open</option>
            <option value="registration_closed">Registration Closed</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </PremiumSelect>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Visibility</span>
          <PremiumSelect
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
          </PremiumSelect>
        </label>
      </div>

      {eventType !== "tournament" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">Capacity (optional)</span>
          <input
            type="number"
            min={1}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
            className={inputCls}
          />
        </label>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="font-semibold">Discord invite override (optional)</span>
        <input
          value={discordInviteUrl}
          onChange={(e) => setDiscordInviteUrl(e.target.value)}
          placeholder="https://discord.gg/…"
          className={inputCls}
        />
      </label>

      <label className="flex items-center gap-2.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="size-4 rounded border-border accent-primary"
        />
        <span className="font-semibold">Featured</span>
      </label>

      {state === "error" || (message && state !== "saved") ? (
        <p className="text-sm text-destructive">{message}</p>
      ) : null}
      {state === "saved" ? (
        <p className="text-sm text-emerald-400">{message}</p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={state === "busy" || uploadingCover}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {state === "busy" ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/events/${eventId}`)}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:bg-secondary"
        >
          View Event
        </button>
      </div>
    </form>
  );
}
