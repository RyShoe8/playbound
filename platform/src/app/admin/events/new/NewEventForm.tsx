"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewEventForm({ gameOptions }: { gameOptions: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gameSlug, setGameSlug] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, gameSlug: gameSlug || null, startsAt }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        router.push("/events");
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
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Description</label>
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Related game (optional)</label>
        <PremiumSelect
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        >
          <option value="">None</option>
          {gameOptions.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </PremiumSelect>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Starts at</label>
        <input
          required
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>
      {state === "error" && <p className="text-xs text-destructive">{message}</p>}
      <button
        type="submit"
        disabled={state === "busy"}
        className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
      >
        {state === "busy" ? "Creating…" : "Create Event"}
      </button>
    </form>
  );
}
