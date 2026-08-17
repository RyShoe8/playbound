"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type InstalledPackage = { url: string; kind: "direct-zip" | "direct-7z"; fileName: string };

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

  async function archive(sourceUrl: string, fileName: string, sizeBytes: number) {
    const base = { gameSlug, ...(editionSlug ? { editionSlug } : {}), sourceUrl, fileName, sizeBytes };
    const queued = await fetch("/api/admin/launcher-package", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(base),
    }).then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => null) }));
    if (!queued.ok || !queued.body?.relativePath) throw new Error(queued.body?.error || "VPS archive could not start");
    setState("Copying to VPS and verifying…");
    let final: InstalledPackage | null = null;
    for (let i = 0; i < 180; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const result = await fetch("/api/admin/launcher-package", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, relativePath: queued.body.relativePath, action: "finalize" }),
      });
      const body = await result.json().catch(() => null);
      if (result.ok && body?.status === "verified") { final = body as InstalledPackage; break; }
      if (result.status !== 202) throw new Error(body?.error || "VPS verification failed");
    }
    if (!final) throw new Error("VPS verification timed out; the copy may still be running.");
    onInstalled?.(final);
    setState(`Live on VPS: ${final.url}`);
  }

  async function selected(file: File) {
    if (!/\.(zip|7z)$/i.test(file.name)) {
      setState("Choose a .zip or .7z launcher package.");
      return;
    }
    setBusy(true);
    setState("Uploading package…");
    try {
      const scope = editionSlug ? `editions/${gameSlug}/${editionSlug}` : `games/${gameSlug}`;
      const blob = await upload(`launcher-packages/${scope}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/launcher-package/upload",
      });
      await archive(blob.url, file.name, file.size);
    } catch (err) {
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
    setState("Copying staged package to VPS…");
    try {
      await archive(stagedUrl.trim(), fileName, sizeBytes);
    } catch (err) {
      setState(err instanceof Error ? err.message : "VPS archive failed");
    } finally { setBusy(false); }
  }

  return <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
    <input ref={inputRef} type="file" accept=".zip,.7z,application/zip,application/x-7z-compressed" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void selected(file); }} />
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || !gameSlug} onClick={() => inputRef.current?.click()} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">
        {busy ? "Uploading to VPS…" : "Upload launcher package"}
      </button>
      <span className="text-[11px] font-medium text-muted-foreground">ZIP/7z only. It becomes live only after VPS verification.</span>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_auto]">
      <input value={stagedUrl} onChange={(e) => setStagedUrl(e.target.value)} placeholder="Existing HTTPS package URL" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <input value={stagedFileName} onChange={(e) => setStagedFileName(e.target.value)} placeholder="File name.zip" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <input value={stagedSizeBytes} onChange={(e) => setStagedSizeBytes(e.target.value)} inputMode="numeric" placeholder="Size in bytes" disabled={busy} className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-xs" />
      <button type="button" disabled={busy || !gameSlug} onClick={() => void archiveStaged()} className="rounded-full border border-primary/40 px-4 py-2 text-xs font-bold text-primary disabled:opacity-60">
        Archive staged package
      </button>
    </div>
    <p className="mt-2 text-[11px] text-muted-foreground">Use this for a package already staged in Blob or another HTTPS source; the final launcher URL is still the VPS mirror.</p>
    {state ? <p className="mt-2 break-all text-xs text-muted-foreground">{state}</p> : null}
  </div>;
}
