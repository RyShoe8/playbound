"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { getRecaptchaToken } from "@/lib/recaptchaClient";
import { useTelemetry } from "@/lib/telemetry";

export function NewsletterForm() {
  const { track } = useTelemetry();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      // Minted at submit time — v3 tokens expire after two minutes, so this
      // must not be hoisted to mount.
      const recaptchaToken = await getRecaptchaToken("newsletter");
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, recaptchaToken }),
      });
      if (res.ok) {
        void track("newsletter_signup", { source: "form" });
        setState("done");
        setMessage("You're in! First issue lands this Wednesday.");
      } else {
        const data = await res.json().catch(() => null);
        setState("error");
        setMessage(data?.error ?? "Something went wrong — try again.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server — try again in a moment.");
    }
  }

  if (state === "done") {
    return <p className="text-sm font-semibold text-play">{message}</p>;
  }

  return (
    <form onSubmit={subscribe} className="flex w-full max-w-md gap-2">
      <div className="relative flex-1">
        <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-10 w-full rounded-full border border-input bg-background/60 pr-4 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <button
        type="submit"
        disabled={state === "busy"}
        className="h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
      >
        {state === "busy" ? "Subscribing…" : "Subscribe"}
      </button>
      {state === "error" && <p className="sr-only">{message}</p>}
      {state === "error" && (
        <p className="absolute mt-11 text-xs text-destructive">{message}</p>
      )}
    </form>
  );
}
