"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bug } from "lucide-react";
import { getRecaptchaToken } from "@/lib/recaptchaClient";

export function ReportBugForm() {
  const { data: session } = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState(session?.user?.email ?? "");
  const [submitterName, setSubmitterName] = useState(session?.user?.username ?? "");
  const [pageUrl, setPageUrl] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(window.location.href);
    }
  }, []);

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
        <Bug className="mx-auto size-8 text-primary" />
        <h2 className="mt-3 text-xl font-extrabold">Thanks — we got it</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your report is in the admin queue. We may follow up if you left an email.
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
        <label className="text-xs font-semibold text-muted-foreground">Short title</label>
        <input
          className={input}
          required
          minLength={3}
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Install button does nothing on Windows"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">What went wrong?</label>
        <textarea
          className={area}
          required
          minLength={10}
          maxLength={8000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Steps to reproduce, what you expected, and what happened."
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Page URL (optional)</label>
        <input className={input} value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} />
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
        <Bug className="size-4" />
        {state === "busy" ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
