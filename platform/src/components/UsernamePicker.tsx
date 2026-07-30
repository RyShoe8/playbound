"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, CircleAlert, Loader2, UserPlus } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; message: string };

const DEBOUNCE_MS = 400;

export function UsernamePicker({
  suggestion,
  email,
  next,
}: {
  suggestion: string;
  email: string;
  next: string;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [username, setUsername] = useState(suggestion);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  // Live availability check, debounced. Advisory only — POST re-checks.
  useEffect(() => {
    const value = username.trim();
    if (value.length < 3) {
      setStatus({ kind: "idle" });
      return;
    }

    setStatus({ kind: "checking" });
    const seq = ++latest.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/username?username=${encodeURIComponent(value)}`
        );
        const data = (await res.json()) as { available?: boolean; error?: string };
        if (seq !== latest.current) return; // a newer keystroke won
        setStatus(
          data.available
            ? { kind: "available" }
            : { kind: "unavailable", message: data.error ?? "Not available" }
        );
      } catch {
        if (seq === latest.current) setStatus({ kind: "idle" });
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [username]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = (await res.json()) as { error?: string; username?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that username");
        setBusy(false);
        return;
      }
      // Refresh the JWT so needsUsername clears and middleware stops
      // redirecting — without this the next navigation bounces back here.
      await update({ username: data.username });
      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  const tooShort = username.trim().length > 0 && username.trim().length < 3;
  const canSubmit =
    !busy && username.trim().length >= 3 && status.kind !== "unavailable";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <UserPlus className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
          Choose your username
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in{email ? ` as ${email}` : ""}. Pick the name that will
          appear on your reviews, guides and discussions.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="username" className="text-xs font-semibold text-muted-foreground">
            Username
          </label>
          <input
            id="username"
            autoFocus
            required
            minLength={3}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ryan_s"
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />

          <div className="mt-1.5 flex min-h-4 items-center gap-1.5 text-[11px]">
            {tooShort && (
              <span className="text-muted-foreground">At least 3 characters.</span>
            )}
            {!tooShort && status.kind === "checking" && (
              <>
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Checking…</span>
              </>
            )}
            {!tooShort && status.kind === "available" && (
              <>
                <Check className="size-3 text-primary" />
                <span className="text-primary">{username.trim()} is available</span>
              </>
            )}
            {!tooShort && status.kind === "unavailable" && (
              <>
                <CircleAlert className="size-3 text-destructive" />
                <span className="text-destructive">{status.message}</span>
              </>
            )}
            {!tooShort && status.kind === "idle" && (
              <span className="text-muted-foreground">
                Letters, numbers and underscores. 3–20 characters.
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        You can change this later from your profile.
      </p>
    </div>
  );
}
