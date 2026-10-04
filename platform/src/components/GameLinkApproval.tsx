"use client";

import { useState } from "react";
import { CheckCircle2, Gamepad2, ShieldAlert } from "lucide-react";

type Props = {
  username: string;
  initialCode: string;
  /** Title of the game that asked, when the code was found. */
  gameTitle: string;
  deviceName: string;
  codeFound: boolean;
};

/** Approve the sign-in code a game is showing (see /api/game-auth/link). */
export function GameLinkApproval({ username, initialCode, gameTitle, deviceName, codeFound }: Props) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  async function respond(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/game-auth/link/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, approve }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Couldn't approve that code");
        return;
      }
      setDone(approve ? "approved" : "denied");
    } catch {
      setError("Couldn't reach PlayBound. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done === "approved") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <h1 className="text-2xl font-extrabold">You&apos;re signed in{gameTitle ? ` to ${gameTitle}` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          Head back to the game, it will finish signing in by itself in a few seconds. You can close this tab.
        </p>
      </div>
    );
  }
  if (done === "denied") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldAlert className="size-12 text-muted-foreground" />
        <h1 className="text-2xl font-extrabold">Sign-in turned down</h1>
        <p className="text-sm text-muted-foreground">Nothing was linked to your account.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Gamepad2 className="size-10 text-primary" />
      <h1 className="text-2xl font-extrabold">
        {codeFound && gameTitle ? `Sign in to ${gameTitle}` : "Sign in to a game"}
      </h1>
      {codeFound ? (
        <p className="text-sm text-muted-foreground">
          {gameTitle}
          {deviceName ? ` on ${deviceName}` : ""} wants to sign in as <strong>{username}</strong>. It will see your
          friends list and can send play invites for you. Only approve if you started this in the game yourself.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Type the code your game is showing to sign it in as <strong>{username}</strong>.
        </p>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD-EFGH"
        maxLength={12}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="w-56 rounded-xl border bg-background px-4 py-3 text-center font-mono text-2xl font-bold tracking-widest"
        aria-label="Code shown in the game"
      />
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length !== 8}
          onClick={() => void respond(true)}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Approve"}
        </button>
        {codeFound && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond(false)}
            className="rounded-full border px-6 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            Not me
          </button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
