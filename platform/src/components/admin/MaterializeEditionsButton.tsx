"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Writes this game's seed-only editions into the database.
 *
 * Editions resolve from stored rows plus the seed file for any slug the
 * database lacks, so a seed-only edition works on the site but is not a record
 * anyone can curate. This turns them into real documents.
 *
 * Always previews first — the confirm step lists exactly what will be created,
 * because "write to the production catalog" is not a thing to do on one click.
 */
export function MaterializeEditionsButton({ gameSlug }: { gameSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(dryRun: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/editions/materialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug, dryRun }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Failed");
        return;
      }
      const created: string[] = data.created ?? [];
      if (dryRun) {
        setPreview(created);
        if (created.length === 0) {
          setMessage("Every edition for this game is already in the database.");
        }
        return;
      }
      setPreview(null);
      setMessage(
        created.length ? `Created ${created.length} edition record(s).` : "Nothing to create."
      );
      router.refresh();
    } catch {
      setMessage("Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {preview && preview.length > 0 ? (
        <div className="flex flex-col items-end gap-1">
          <p className="max-w-md text-right text-xs text-muted-foreground">
            Will create {preview.length} record(s): {preview.join(", ")}. Existing editions and
            all game fields are left untouched.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void call(false)}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Writing…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
              className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void call(true)}
          className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/70 disabled:opacity-60"
        >
          {busy ? "Checking…" : "Save seed editions to database"}
        </button>
      )}
      {message && <p className="max-w-xs text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
