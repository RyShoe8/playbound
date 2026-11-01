"use client";

import { useState } from "react";

type Fields = Record<string, string>;

export function AssignedItemEditor({ title, endpoint, initial, labels }: {
  title: string;
  endpoint: string;
  initial: Fields;
  labels: Record<string, string>;
}) {
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) });
      const data = await response.json();
      setMessage(response.ok ? "Saved." : data.error || "Could not save changes.");
    } catch {
      setMessage("Could not reach PlayBound.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7">
      <h1 className="text-2xl font-bold">Manage {title}</h1>
      <p className="text-sm text-muted-foreground">Update this item’s description and media. PlayBound manages publication and editorial settings.</p>
      {Object.entries(labels).map(([key, label]) => (
        <label key={key} className="block text-sm font-semibold">
          {label}
          {key === "description" ? (
            <textarea value={fields[key] || ""} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} rows={10} className="mt-2 w-full rounded-lg border border-border bg-background p-3 font-normal" />
          ) : (
            <input value={fields[key] || ""} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} className="mt-2 block w-full rounded-lg border border-border bg-background p-3 font-normal" />
          )}
        </label>
      ))}
      <div className="flex items-center gap-4"><button disabled={busy} className="rounded-lg bg-primary px-5 py-2 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button><span role="status" className="text-sm">{message}</span></div>
    </form>
  );
}
