"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePartyStore } from "@/stores/partyStore";
import type { PartyPayload } from "@/lib/playTogether/types";

export function JoinPartyButton({
  party,
  className,
}: {
  party: PartyPayload;
  className?: string;
}) {
  const { status } = useSession();
  const router = useRouter();
  const { joinParty } = usePartyStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [askPassword, setAskPassword] = useState(false);

  if (status !== "authenticated") {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent("/events")}`}
        className={className ?? "rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"}
      >
        Sign in to join
      </Link>
    );
  }

  async function submit(pw?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await joinParty(party.id, pw);
      if (!result) {
        setError("Could not join this party.");
        if (party.hasPassword) setAskPassword(true);
        return;
      }
      router.push("/friends");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {askPassword || party.hasPassword ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(password)}
            className={className ?? "rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"}
          >
            {busy ? "Joining…" : "Join"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className={className ?? "rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"}
        >
          {busy ? "Joining…" : party.status === "playing" ? "Join in progress" : "Join"}
        </button>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
