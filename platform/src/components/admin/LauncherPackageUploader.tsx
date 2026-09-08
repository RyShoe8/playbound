"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type InstalledPackage = { url: string; kind: "direct-zip" | "direct-7z"; fileName: string };

/** A queued VPS copy, kept so a slow one can be resumed rather than lost. */
type Pending = {
  relativePath: string;
  gameSlug: string;
  editionSlug?: string;
  fileName: string;
  sourceUrl: string;
  sizeBytes: number;
};

/*
 * How long to wait on the VPS copy before handing the job back to the operator.
 *
 * This was 180 fixed iterations of 2s — six minutes. The VPS pulls the package
 * from Blob itself, so the wait scales with package size, and a 2 GB archive
 * routinely runs past that. On timeout the poll simply gave up and nothing was
 * written to the catalog, which reads as "the upload worked but the game still
 * wants an install URL" while the copy is in fact still running.
 */
const VPS_POLL_CEILING_MS = 45 * 60 * 1000;
const VPS_POLL_INTERVAL_MS = 3000;

function mb(bytes: number) {
  return `${(bytes / 1048576).toFixed(bytes >= 1073741824 ? 2 : 0)} MB`;
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

export function LauncherPackageUploader({
  gameSlug,
  editionSlug,
  onInstalled,
}: {
  gameSlug: string;
  editionSlug?: string;
  onInstalled?: (value: InstalledPackage) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [stagedUrl, setStagedUrl] = useState("");
  const [stagedFileName, setStagedFileName] = useState("");
  const [stagedSizeBytes, setStagedSizeBytes] = useState("");
  /** null while idle; 0-100 during the Blob upload; -1 for the VPS copy, which reports no percentage. */
  const [percent, setPercent] = useState<number | null>(null);
  const [transferred, setTransferred] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  /*
   * Survives a reload or a closed tab. A multi-gigabyte copy outlives the
   * operator's patience, and without the relativePath there is no way to ask
   * the host how it went — the package ends up verified on the VPS with
   * nothing in the catalog pointing at it.
   */
  const pendingKey = `playbound:launcher-package:${gameSlug}:${editionSlug || ""}`;
  useEffect(() => {
    if (!gameSlug) return;
    try {
      const stored = window.localStorage.getItem(pendingKey);
      if (stored) setPending(JSON.parse(stored) as Pending);
    } catch {
      /* ignore unreadable storage */
    }
  }, [pendingKey, gameSlug]);

  function rememberPending(value: Pending | null) {
    setPending(value);
    try {
      if (value) window.localStorage.setItem(pendingKey, JSON.stringify(value));
      else window.localStorage.removeItem(pendingKey);
    } catch {
      /* ignore unwritable storage */
    }
  }

  async function pollUntilVerified(job: Pending) {
    const base = {
      gameSlug: job.gameSlug,
      ...(job.editionSlug ? { editionSlug: job.editionSlug } : {}),
      sourceUrl: job.sourceUrl,
      fileName: job.fileName,
      sizeBytes: job.sizeBytes,
    };
    const startedAt = Date.now();
    setPercent(-1);
    while (Date.now() - startedAt < VPS_POLL_CEILING_MS) {
      setElapsed(clock(Date.now() - startedAt));
      setState("Copying to VPS and verifying…");
      await new Promise((resolve) => window.setTimeout(resolve, VPS_POLL_INTERVAL_MS));
      const result = await fetch("/api/admin/launcher-package", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, relativePath: job.relativePath, action: "finalize" }),
      });
      const body = await result.json().catch(() => null);
      if (result.ok && body?.status === "verified") {
        rememberPending(null);
        setPercent(null);
        onInstalled?.(body as InstalledPackage);
        setState(`Live on VPS: ${(body as InstalledPackage).url}`);
        return;
      }
      if (result.status !== 202) throw new Error(body?.error || "VPS verification failed");
    }
    // Deliberately keeps the job so "Resume VPS check" can pick it up later.
    setPercent(null);
    throw new Error(
      "Still copying after 45 minutes. The copy keeps running on the host — press Resume VPS check later to finish it."
    );
  }

  async function archive(sourceUrl: string, fileName: string, sizeBytes: number) {
    const base = { gameSlug, ...(editionSlug ? { editionSlug } : {}), sourceUrl, fileName, sizeBytes };
    setState("Asking the VPS to pull the package…");
    const queued = await fetch("/api/admin/launcher-package", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(base),
    }).then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => null) }));
    if (!queued.ok || !queued.body?.relativePath) throw new Error(queued.body?.error || "VPS archive could not start");
    const job: Pending = { relativePath: queued.body.relativePath, gameSlug, editionSlug, fileName, sourceUrl, sizeBytes };
    rememberPending(job);
    await pollUntilVerified(job);
  }

  async function selected(file: File) {
    if (!/\.(zip|7z)$/i.test(file.name)) {
      setState("Choose a .zip or .7z launcher package.");
      return;
    }
    setBusy(true);
    setPercent(0);
    setTransferred("");
    setState(`Uploading ${file.name} (${mb(file.size)})…`);
    try {
      const scope = editionSlug ? `editions/${gameSlug}/${editionSlug}` : `games/${gameSlug}`;
      const blob = await upload(`launcher-packages/${scope}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/launcher-package/upload",
        /*
         * Required at this size, not an optimisation. A single PUT of a
         * multi-gigabyte body has no resume and no progress: one dropped
         * connection loses the whole transfer, which is how a 2 GB package
         * can appear to upload for a long time and never land.
         */
        multipart: true,
        onUploadProgress: ({ percentage, loaded, total }) => {
          setPercent(percentage);
          setTransferred(`${mb(loaded)} of ${mb(total)}`);
        },
      });
      setTransferred("");
      await archive(blob.url, file.name, file.size);
    } catch (err) {
      setPercent(null);
      setState(err instanceof Error ? err.message : "Package upload failed");
    } finally { setBusy(false); }
  }

  async function archiveStaged() {
    const fileName = stagedFileName.trim();
    const sizeBytes = Number(stagedSizeBytes);
    if (!/^https:\/\//i.test(stagedUrl.trim()) || !/\.(zip|7z)$/i.test(fileName) || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      setState("Enter an HTTPS ZIP/7z URL, filename, and exact byte size.");
      return;
    }
    setBusy(true);
    try {
      await archive(stagedUrl.trim(), fileName, sizeBytes);
    } catch (err) {
      setState(err instanceof Error ? err.message : "VPS archive failed");
    } finally { setBusy(false); }
  }

  async function resumePending() {
    if (!pending) return;
    setBusy(true);
    try {
      await pollUntilVerified(pending);
    } catch (err) {
      setState(err instanceof Error ? err.message : "VPS verification failed");
    } finally { setBusy(false); }
  }

  return <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
    <input ref={inputRef} type="file" accept=".zip,.7z,application/zip,application/x-7z-compressed" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void selected(file); }} />
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || !gameSlug} onClick={() => inputRef.current?.click()} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
        {busy ? "Working…" : "Upload launcher package"}
      </button>
      <span className="text-[11px] font-medium text-muted-foreground">ZIP/7z only. It becomes live only after VPS verification.</span>
    </div>

    {percent !== null ? (
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full bg-primary transition-[width] duration-300 ${percent < 0 ? "animate-pulse" : ""}`}
            style={{ width: percent < 0 ? "100%" : `${Math.max(2, percent)}%` }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
          <span>{percent < 0 ? "Copying to VPS — the host reports no percentage" : `${percent.toFixed(1)}%`}</span>
          <span>{percent < 0 ? elapsed : transferred}</span>
        </div>
      </div>
    ) : null}

    {pending && !busy ? (
      <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
        <p className="text-[11px] font-semibold">A VPS copy of {pending.fileName} was left unfinished.</p>
        <p className="mt-0.5 text-[11px] break-all text-muted-foreground">{pending.relativePath}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void resumePending()} className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground">
            Resume VPS check
          </button>
          <button type="button" onClick={() => { rememberPending(null); setState(""); }} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold">
            Discard
          </button>
        </div>
      </div>
    ) : null}

    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto]">
      <input value={stagedUrl} onChange={(e) => setStagedUrl(e.target.value)} placeholder="Existing HTTPS package URL" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <input value={stagedFileName} onChange={(e) => setStagedFileName(e.target.value)} placeholder="File name.zip" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <input value={stagedSizeBytes} onChange={(e) => setStagedSizeBytes(e.target.value)} inputMode="numeric" placeholder="Size in bytes" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <button type="button" disabled={busy || !gameSlug} onClick={() => void archiveStaged()} className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold text-primary disabled:opacity-60">
        Archive staged package
      </button>
    </div>
    <p className="mt-2 text-[11px] text-muted-foreground">Use this for a package already staged in Blob or another HTTPS source; the final launcher URL is still the VPS mirror. Multi-gigabyte packages go up faster from the CLI — <code className="rounded bg-secondary px-1">npm run mirror:asset</code> — then paste that URL here.</p>
    {state ? <p className="mt-2 break-all text-xs text-muted-foreground">{state}</p> : null}
  </div>;
}
