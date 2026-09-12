"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { formatDataVolume, formatVpsTransferMessage, vpsTransferPercent } from "@/lib/mirrors/vpsProgress";

const FILENAME_RE = /^PlayBound-Setup-\d+\.\d+\.\d+\.exe$/i;

/** SHA-256 (hex) and SHA-512 (base64) computed in the browser before upload starts. */
async function computeChecksums(file: File): Promise<{ sha256: string; sha512: string }> {
  const buffer = await file.arrayBuffer();
  const digest256 = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = [...new Uint8Array(digest256)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const digest512 = await crypto.subtle.digest("SHA-512", buffer);
  let binary = "";
  const bytes512 = new Uint8Array(digest512);
  for (let i = 0; i < bytes512.byteLength; i++) {
    binary += String.fromCharCode(bytes512[i]);
  }
  const sha512 = btoa(binary);
  return { sha256, sha512 };
}

/**
 * Upload a signed launcher installer — the entire public Windows release path.
 *
 * After `npm run dist:prod`, upload here, wait for On VPS, then Promote to R2
 * in the cache table below. That publishes site download + auto-update
 * (`latest.yml` with a URL ending in `.exe`). Do not use `upload:launcher --prod`.
 */
export function LauncherReleaseUploader({
  onComplete,
}: {
  /** Refresh the cache table after a successful VPS archive (or failed register). */
  onComplete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [transferred, setTransferred] = useState("");
  const [phase, setPhase] = useState<"idle" | "blob" | "vps">("idle");

  /**
   * By the time this call's own POST returns, the server has already set
   * vpsStatus to "uploading" (or "verified", if the copy resolved inline) —
   * that write happens before the response is sent. So the very first poll
   * here never legitimately sees "missing"; if it does, the transfer failed
   * server-side, and waiting longer will not change that.
   */
  async function pollUntilVerified(
    artifactId: string,
    expectedSize: number
  ): Promise<{ ok: boolean; detail?: string }> {
    setPhase("vps");
    setPercent(0);
    setTransferred(formatVpsTransferMessage(0, expectedSize));
    for (let i = 0; i < 180; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const res = await fetch(`/api/admin/download-mirrors/artifacts/${encodeURIComponent(artifactId)}`);
      const body = await res.json().catch(() => null);
      const vpsStatus = body?.artifact?.vpsStatus;
      if (vpsStatus === "verified") {
        setPercent(100);
        return { ok: true };
      }
      if (vpsStatus === "missing") {
        return { ok: false, detail: body?.artifact?.vpsStatusMessage };
      }
      const received = Number(body?.transfer?.bytesReceived) || 0;
      const total = Number(body?.transfer?.sizeBytes) || expectedSize;
      const pct =
        body?.transfer?.percent != null
          ? Number(body.transfer.percent)
          : vpsTransferPercent(received, total);
      if (pct != null) setPercent(pct);
      setTransferred(
        body?.artifact?.vpsStatusMessage || formatVpsTransferMessage(received, total)
      );
      setStatus("Copying to VPS and verifying…");
    }
    return {
      ok: false,
      detail:
        "Timed out waiting for the VPS to confirm the copy. Refresh this page — if the row shows On VPS, Promote to R2. If still Uploading, wait or retry the upload.",
    };
  }

  async function selected(file: File) {
    if (!FILENAME_RE.test(file.name)) {
      setStatus("Choose the built installer — expected PlayBound-Setup-<version>.exe.");
      return;
    }
    setBusy(true);
    setPhase("blob");
    setPercent(0);
    setTransferred("");
    try {
      setStatus("Hashing file…");
      const { sha256, sha512 } = await computeChecksums(file);

      setStatus(`Uploading ${file.name} (${formatDataVolume(file.size)})…`);
      const blob = await upload(`launcher/staged/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/launcher-release/upload",
        multipart: true,
        onUploadProgress: ({ percentage, loaded, total }) => {
          setPercent(percentage);
          setTransferred(`${formatDataVolume(loaded)} of ${formatDataVolume(total)}`);
        },
      });

      setStatus("Registering release and starting VPS transfer…");
      const res = await fetch("/api/admin/launcher-release", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sourceUrl: blob.url, sizeBytes: file.size, sha256, sha512 }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.artifactId) throw new Error(body?.error || "Could not register the release");
      if (!body.success) throw new Error(body.message || "VPS archive could not start");

      setStatus("Copying to VPS and verifying…");
      onComplete?.();
      const result = await pollUntilVerified(body.artifactId, file.size);
      setStatus(
        result.ok
          ? "On the VPS. Promote to R2 below — that finishes the public signed release (site download + auto-update)."
          : result.detail || "VPS transfer did not complete."
      );
      onComplete?.();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
      onComplete?.();
    } finally {
      setBusy(false);
      setPhase("idle");
      setPercent(null);
      setTransferred("");
    }
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
      <input
        ref={inputRef}
        type="file"
        accept=".exe,application/x-msdownload,application/octet-stream"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void selected(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Upload signed launcher"}
        </button>
        <span className="text-[11px] font-medium text-muted-foreground">
          PlayBound-Setup-&lt;version&gt;.exe from{" "}
          <code className="rounded bg-secondary px-1 py-0.5">npm run dist:prod</code>. Public
          release = this upload + Promote to R2 (no CLI Blob --prod step).
        </span>
      </div>
      {percent !== null ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span>
              {phase === "vps" ? "Copying to VPS" : phase === "blob" ? "Uploading to Blob" : "Working"} —{" "}
              {percent.toFixed(1)}%
            </span>
            <span>{transferred}</span>
          </div>
        </div>
      ) : null}
      {status ? <p className="mt-2 break-all text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
