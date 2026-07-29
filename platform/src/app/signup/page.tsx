"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, UserPlus } from "lucide-react";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, password, newsletterOptIn }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setMessage(data?.error ?? "Something went wrong — try again.");
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server — try again in a moment.");
    }
  }

  if (state === "done") {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Mail className="size-10 text-play" />
        <h1 className="text-2xl font-extrabold">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <span className="font-semibold text-foreground">{email}</span>.
          Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Go to sign in →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <UserPlus className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Free forever. Just like every game on PlayBound.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Username</label>
          <input
            required
            minLength={3}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={newsletterOptIn}
            onChange={(e) => setNewsletterOptIn(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">Email me the PlayBound Weekly newsletter</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              One email Fridays with what&apos;s worth playing. Unsubscribe any time. See our{" "}
              <Link href="/privacy" className="underline hover:text-foreground">
                privacy policy
              </Link>
              .
            </span>
          </span>
        </label>
        {state === "error" && <p className="text-xs text-destructive">{message}</p>}
        <button
          type="submit"
          disabled={state === "busy"}
          className="h-10 w-full rounded-full bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {state === "busy" ? "Creating account…" : "Sign Up"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
