"use client";

import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: string; serverId: string | null; category: string; subject: string;
  status: string; lastMessageAt: string;
  owner?: { username: string | null; email: string | null } | null;
  messages: Array<{ id: string; authorRole: "customer" | "admin"; body: string; createdAt: string }>;
};

const CATEGORIES = ["billing", "server", "game", "other"];

export function HostingSupport({ admin = false, servers = [] }: { admin?: boolean; servers?: Array<{ id: string; name: string }> }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("server");
  const [serverId, setServerId] = useState("");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = admin ? "/api/admin/hosting/support" : "/api/hosting/support";
  const load = useCallback(async () => {
    const response = await fetch(base, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load support requests");
    setTickets(data.tickets);
  }, [base]);
  useEffect(() => { const timer = setTimeout(() => void load().catch((e) => setError(e.message)), 0); return () => clearTimeout(timer); }, [load]);

  async function send(path: string, method: string, payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
      return false;
    } finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-label="Hosting support">
    <div><h2 className="text-lg font-semibold">Hosting support</h2><p className="text-sm text-muted-foreground">{admin ? "Customer requests and replies" : "Ask us about your servers or billing. Replies appear here."}</p></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!admin ? <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      if (await send(base, "POST", { category, subject, body, serverId: serverId || null })) { setSubject(""); setBody(""); }
    }}>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Support category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded border border-border bg-background p-2 text-sm">{CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select>
        <select aria-label="Related server" value={serverId} onChange={(event) => setServerId(event.target.value)} className="rounded border border-border bg-background p-2 text-sm"><option value="">No specific server</option>{servers.map((server) => <option key={server.id} value={server.id}>{server.name}</option>)}</select>
      </div>
      <input aria-label="Subject" required maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What can we help with?" className="w-full rounded border border-border bg-background p-2 text-sm" />
      <textarea aria-label="Message" required maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Tell us what happened" rows={3} className="w-full rounded border border-border bg-background p-2 text-sm" />
      <button disabled={busy} type="submit" className="rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Send request</button>
    </form> : null}
    <div className="space-y-3">{tickets.length === 0 ? <p className="text-sm text-muted-foreground">No support requests yet.</p> : tickets.map((ticket) => <details key={ticket.id} className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold">{ticket.subject} · {ticket.status.replaceAll("_", " ")}{admin && ticket.owner ? ` · ${ticket.owner.username || ticket.owner.email || "Customer"}` : ""}</summary>
      <p className="mt-2 text-xs text-muted-foreground">{ticket.category} · {new Date(ticket.lastMessageAt).toLocaleString()}{ticket.serverId ? ` · Server ${ticket.serverId}` : ""}</p>
      <div className="mt-3 space-y-2">{ticket.messages.map((message) => <div key={message.id} className="rounded bg-secondary/50 p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">{message.authorRole === "admin" ? "PlayBound" : "Customer"} · {new Date(message.createdAt).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p></div>)}</div>
      {admin ? <select aria-label={`Status for ${ticket.subject}`} value={ticket.status} disabled={busy} onChange={(event) => void send(`${base}/${ticket.id}`, "PATCH", { status: event.target.value })} className="mt-3 rounded border border-border bg-background p-2 text-sm"><option value="open">Open</option><option value="waiting_on_customer">Waiting on customer</option><option value="resolved">Resolved</option></select> : null}
      <form className="mt-3 flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (await send(`${base}/${ticket.id}`, "POST", { body: replies[ticket.id] || "" })) setReplies((old) => ({ ...old, [ticket.id]: "" })); }}>
        <input aria-label={`Reply to ${ticket.subject}`} required maxLength={4000} value={replies[ticket.id] || ""} onChange={(event) => setReplies((old) => ({ ...old, [ticket.id]: event.target.value }))} placeholder="Write a reply" className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" />
        <button disabled={busy} className="rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Reply</button>
      </form>
    </details>)}</div>
  </section>;
}
