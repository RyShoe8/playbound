"use client";
import { PremiumSelect } from "@/components/ui/PremiumSelect";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getRecaptchaToken } from "@/lib/recaptchaClient";
import { REPORT_REASONS } from "@/lib/discussion/reportConstants";
import { useTelemetry } from "@/lib/telemetry";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "topic" | "reply";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("spam");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState("");
  const { track } = useTelemetry();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const recaptchaToken = await getRecaptchaToken("discussion_report");
    const res = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        reason,
        details: details || undefined,
        recaptchaToken: recaptchaToken ?? undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      void track("discussion_report", { topicId: targetId, reason });
      setOpen(false);
      setMsg("Report submitted. Thank you.");
    } else {
      setMsg(data?.error ?? "Could not submit report.");
    }
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Report
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
      <PremiumSelect
        value={reason}
        onChange={(e) => setReason(e.target.value as typeof reason)}
        className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, " ")}
          </option>
        ))}
      </PremiumSelect>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Optional details"
        rows={2}
        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
      />
      {msg && <p className="text-xs text-destructive">{msg}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-white">
          Submit report
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ReplyComposer({
  topicId,
  gameSlug,
  isSignedIn,
  locked,
  quotedReplyId,
  onClearQuote,
}: {
  topicId: string;
  gameSlug: string;
  isSignedIn: boolean;
  locked: boolean;
  quotedReplyId?: string | null;
  onClearQuote?: () => void;
}) {
  const router = useRouter();
  const { track } = useTelemetry();
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!isSignedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?callbackUrl=/games/${gameSlug}/discussion`}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>{" "}
        to reply.
      </p>
    );
  }

  if (locked) {
    return <p className="text-sm text-muted-foreground">This discussion is locked.</p>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch(`/api/discussions/${topicId}/replies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, quotedReplyId: quotedReplyId || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        void track("discussion_reply", { topicId, gameId: gameSlug });
        setBody("");
        onClearQuote?.();
        setState("idle");
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
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-4">
      {quotedReplyId && (
        <p className="text-xs text-muted-foreground">
          Replying with quote.{" "}
          <button type="button" onClick={onClearQuote} className="font-semibold text-primary">
            Clear
          </button>
        </p>
      )}
      <textarea
        required
        minLength={5}
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply. Markdown is supported."
        className="w-full resize-y rounded-lg border border-input bg-secondary/50 px-3 py-2 text-sm"
      />
      {state === "error" && <p className="text-xs text-destructive">{message}</p>}
      <button
        type="submit"
        disabled={state === "busy"}
        className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {state === "busy" ? "Posting…" : "Write a reply"}
      </button>
    </form>
  );
}

export function HelpfulButton({
  targetType,
  targetId,
}: {
  targetType: "topic" | "reply";
  targetId: string;
}) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const { track } = useTelemetry();

  async function react() {
    setErr("");
    const res = await fetch("/api/community/reactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reaction: "helpful" }),
    });
    if (res.ok || res.status === 409) {
      void track("discussion_upvote", { topicId: targetId, targetType });
      setDone(true);
    } else {
      const data = await res.json().catch(() => null);
      setErr(data?.error ?? "Could not react");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={done}
        onClick={react}
        className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {done ? "Marked helpful" : "Helpful"}
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </span>
  );
}

export function AcceptSolutionButton({ replyId }: { replyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    await fetch(`/api/discussion-replies/${replyId}/accept`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={accept}
      className="text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-60"
    >
      Mark as solution
    </button>
  );
}
