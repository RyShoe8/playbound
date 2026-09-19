"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Send, CheckCircle2, AlertCircle } from "lucide-react";

export function DeveloperClaimForm({ userEmail }: { userEmail: string }) {
  const [claimType, setClaimType] = useState<"game" | "developer">("game");
  const [targetSlug, setTargetSlug] = useState("");
  const [contactEmail, setContactEmail] = useState(userEmail || "");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/developer/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimType,
          gameSlug: claimType === "game" ? targetSlug.trim().toLowerCase() : null,
          developerSlug: claimType === "developer" ? targetSlug.trim().toLowerCase() : null,
          contactEmail,
          verificationUrl,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Submission failed" });
        return;
      }

      setResult({ success: true });
    } catch {
      setResult({ error: "Network error occurred. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
        <h2 className="mt-3 text-lg font-bold text-foreground">Claim Submitted for Review</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          Thank you for verifying your affiliation! Our team reviews ownership requests promptly.
          Once approved, you will have immediate management access to your game and studio pages
          on this dashboard.
        </p>
        <div className="mt-6">
          <Link
            href="/developer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {result?.error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-300">
          <AlertCircle className="size-4 shrink-0" />
          {result.error}
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            What are you claiming?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setClaimType("game")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                claimType === "game"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="font-bold text-sm">Game Page</div>
              <div className="text-xs text-muted-foreground mt-0.5">Claim ownership of a specific game title</div>
            </button>

            <button
              type="button"
              onClick={() => setClaimType("developer")}
              className={`rounded-lg border p-3 text-left transition-colors ${
                claimType === "developer"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="font-bold text-sm">Developer Studio</div>
              <div className="text-xs text-muted-foreground mt-0.5">Claim studio profile &amp; all associated games</div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground">
            Target {claimType === "game" ? "Game Slug or Name" : "Developer Studio Slug or Name"}
          </label>
          <input
            type="text"
            required
            value={targetSlug}
            onChange={(e) => setTargetSlug(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            placeholder={claimType === "game" ? "e.g. beyond-all-reason or Beyond All Reason" : "e.g. openra-team or OpenRA Team"}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            As shown in the URL: playbound.net/{claimType === "game" ? "games" : "developers"}/[slug]
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground">Contact Email</label>
          <input
            type="email"
            required
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            placeholder="developer@yourstudio.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground">
            Verification Link (Proof of Affiliation)
          </label>
          <input
            type="url"
            required
            value={verificationUrl}
            onChange={(e) => setVerificationUrl(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            placeholder="https://github.com/... or https://yourstudio.com/team"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Link to your official studio website, GitHub organization, security.txt, or social account confirming your role.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground">Notes for Reviewers (optional)</label>
          <textarea
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            placeholder="Any extra context or links to help verify your identity quickly..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/developer"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          &larr; Cancel and return to Dashboard
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="size-3.5" />
          {submitting ? "Submitting Claim..." : "Submit Claim for Verification"}
        </button>
      </div>
    </form>
  );
}
