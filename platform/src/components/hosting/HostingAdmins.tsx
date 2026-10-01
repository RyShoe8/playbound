"use client";

import { useEffect, useState } from "react";

type Admin = { userId: string; username: string; email: string };
type Invite = { id: string; email: string; expiresAt: string };

export function HostingAdmins() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/hosting/admins", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setAdmins(data.admins || []);
      setInvites(data.invites || []);
    }
  }
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, []);

  async function change(method: "POST" | "DELETE", body: Record<string, string>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/hosting/admins", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update administrators");
      setMessage(data.invited ? "Invitation sent. Access begins after signup and email verification." : "Administrators updated.");
      setUsername(""); setEmail("");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div><h2 className="text-lg font-bold">Account administrators</h2><p className="text-sm text-muted-foreground">These people can manage every server on this plan, including new ones. Only you can manage billing and delete servers.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); void change("POST", { username }); }} className="flex gap-2"><input aria-label="PlayBound username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="PlayBound name" required className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm" /><button disabled={busy} className="rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button></form>
      <form onSubmit={(e) => { e.preventDefault(); void change("POST", { email }); }} className="flex gap-2"><input aria-label="Invite by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Invite by email" required className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm" /><button disabled={busy} className="rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Invite</button></form>
    </div>
    {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    <ul className="space-y-2 text-sm">
      {admins.map((admin) => <li key={admin.userId} className="flex items-center justify-between gap-3"><span>{admin.username} <span className="text-muted-foreground">({admin.email})</span></span><button disabled={busy} onClick={() => void change("DELETE", { userId: admin.userId })} className="text-primary hover:underline">Remove</button></li>)}
      {invites.map((invite) => <li key={invite.id} className="flex items-center justify-between gap-3"><span>{invite.email} <span className="text-muted-foreground">· invitation pending</span></span><button disabled={busy} onClick={() => void change("DELETE", { inviteId: invite.id })} className="text-primary hover:underline">Cancel</button></li>)}
    </ul>
  </section>;
}
