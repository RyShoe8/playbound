"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Send } from "lucide-react";

const subscribe = () => () => {};

export function SubmitGameForm({ kind = "game", games = [] }: {
  kind?: "game" | "mod" | "edition";
  games?: { slug: string; title: string }[];
}) {
  const [baseGameSlug, setBaseGameSlug] = useState("");
  const interactive = useSyncExternalStore(subscribe, () => true, () => false);
  const { data: session } = useSession();
  const [title, setTitle] = useState("");
  const [website, setWebsite] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [contactEmail, setContactEmail] = useState(session?.user?.email ?? "");
  const [submitterName, setSubmitterName] = useState(session?.user?.username ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/game-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          baseGameSlug: baseGameSlug || undefined,
          title,
          website,
          githubRepo,
          description,
          license,
          contactEmail,
          submitterName,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setMessage(data?.error ?? "Something went wrong.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <Send className="mx-auto size-8 text-primary" />
        <h2 className="mt-3 text-xl font-extrabold">Thanks — we got it</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your submission is in the review queue. If we add it to the catalog, we&apos;ll reach out
          at the email you provided.
        </p>
        <Link href="/discover" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Browse games →
        </Link>
      </div>
    );
  }

  const input =
    "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
  const area =
    "mt-1 min-h-28 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <form inert={!interactive} onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
      {kind !== "game" && (
        <label className="block text-xs font-semibold text-muted-foreground">
          Base game
          <select className={input} required value={baseGameSlug} onChange={e => setBaseGameSlug(e.target.value)}>
            <option value="">Choose a game</option>
            {games.map(game => <option key={game.slug} value={game.slug}>{game.title}</option>)}
          </select>
        </label>
      )}
      <div>
        <label htmlFor="submission-title" className="text-xs font-semibold text-muted-foreground capitalize">{kind} title</label>
        <input id="submission-title" className={input} required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Official website</label>
        <input
          className={input}
          type="url"
          required
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">GitHub repo (optional)</label>
        <input
          className={input}
          placeholder="owner/repo"
          value={githubRepo}
          onChange={(e) => setGithubRepo(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">License (optional)</label>
        <input
          className={input}
          placeholder="e.g. GPL-3.0, MIT, CC0"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">{kind === "mod" ? "What does it change, and which game versions does it support?" : kind === "edition" ? "What makes this edition different, and how do players install it?" : "Why it belongs on PlayBound"}</label>
        <textarea
          className={area}
          required
          minLength={20}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Your name</label>
          <input className={input} value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Contact email</label>
          <input
            className={input}
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
      </div>
      {state === "error" && <p className="text-xs text-destructive">{message}</p>}
      <button
        type="submit"
        disabled={!interactive || state === "busy"}
        className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
      >
        {state === "busy" ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
