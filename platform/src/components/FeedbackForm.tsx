"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bug, Lightbulb } from "lucide-react";
import { getRecaptchaToken } from "@/lib/recaptchaClient";
import { cn } from "@/lib/utils";
import type { BugReportKind } from "@/lib/bugReports";

export function FeedbackForm() {
  const { data: session } = useSession();
  const [kind, setKind] = useState<BugReportKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState(session?.user?.email ?? "");
  const [submitterName, setSubmitterName] = useState(session?.user?.username ?? "");
  const [pageUrlOverride, setPageUrlOverride] = useState<string | null>(null);
  const currentUrl = useSyncExternalStore(
    () => () => {},
    () => window.location.href,
    () => ""
  );
  const pageUrl = pageUrlOverride ?? currentUrl;
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setMessage("");
    try {
      const recaptchaToken = await getRecaptchaToken("bug_report");
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          kind,
          source: "website",
          pageUrl: pageUrl || (typeof window !== "undefined" ? window.location.href : ""),
          contactEmail,
          submitterName,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          recaptchaToken: recaptchaToken ?? undefined,
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
        {kind === "suggestion" ? (
          <Lightbulb className="mx-auto size-8 text-primary" />
        ) : (
          <Bug className="mx-auto size-8 text-primary" />
        )}
        <h2 className="mt-3 text-xl font-extrabold">Thanks — we got it</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your {kind === "suggestion" ? "suggestion" : "report"} is in the admin queue. We may follow up
          if you left an email.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
          Back to home →
        </Link>
      </div>
    );
  }

  const input =
    "mt-1 h-10 w-full rounded-lg border border-input bg-secondary/50 px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";
  const area =
    "mt-1 min-h-32 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div>
        <label className="text-xs font-semibold text-muted-foreground">What is this?</label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind("bug")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors",
              kind === "bug"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <Bug className="size-4" /> Bug
          </button>
          <button
            type="button"
            onClick={() => setKind("suggestion")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors",
              kind === "suggestion"
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-secondary/50 text-muted-foreground hover:text-foreground"
            )}
          >
            <Lightbulb className="size-4" /> Suggestion
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Short title</label>
        <input
          className={input}
          required
          minLength={3}
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "suggestion"
              ? "e.g. Add a dark mode toggle to the launcher"
              : "e.g. Install button does nothing on Windows"
          }
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">
          {kind === "suggestion" ? "What's your idea?" : "What went wrong?"}
        </label>
        <textarea
          className={area}
          required
          minLength={10}
          maxLength={8000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            kind === "suggestion"
              ? "What would you like to see, and why?"
              : "Steps to reproduce, what you expected, and what happened."
          }
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Page URL (optional)</label>
        <input className={input} value={pageUrl} onChange={(e) => setPageUrlOverride(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Your name (optional)</label>
          <input className={input} value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Email (optional)</label>
          <input
            className={input}
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>
      </div>
      {state === "error" && <p className="text-sm text-destructive">{message}</p>}
      <button
        type="submit"
        disabled={state === "busy"}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {kind === "suggestion" ? <Lightbulb className="size-4" /> : <Bug className="size-4" />}
        {state === "busy" ? "Sending…" : kind === "suggestion" ? "Send suggestion" : "Send report"}
      </button>
    </form>
  );
}
