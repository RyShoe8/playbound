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

  async function selected(file: File) {
    if (!/\.(zip|7z)$/i.test(file.name)) {
      setState("Choose a .zip or .7z launcher package.");
      return;
    }
    setBusy(true);
    setState("Uploading package…");
    try {
      const scope = editionSlug ? `editions/${gameSlug}/${editionSlug}` : `games/${gameSlug}`;
      const ext = file.name.split(".").pop()?.toLowerCase() || "zip";
      const blob = await upload(`launcher-packages/${scope}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "-")}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/launcher-package/upload",
      });
      const base = { gameSlug, ...(editionSlug ? { editionSlug } : {}), sourceUrl: blob.url, fileName: file.name, sizeBytes: file.size };
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
    } catch (err) {
      setState(err instanceof Error ? err.message : "Package upload failed");
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
    {state ? <p className="mt-2 break-all text-xs text-muted-foreground">{state}</p> : null}
  </div>;
}
