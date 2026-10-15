"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Entry = { name: string; directory: boolean; bytes: number | null; modifiedAt: string };
type OpenFile = { path: string; text: string | null; etag: string; version: string; contentBase64: string; bytes: number };
type Revision = { id: string; path: string; at: string; bytes: number };
const LIMIT = 64 * 1024 ** 2;
const CHUNK = 1024 ** 2;
const button = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50";
function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

export function ServerFiles({ base, stopped, canWrite, onDirtyChange }: { base: string; stopped: boolean; canWrite: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const lock = useRef(false);
  const dirty = file?.text != null && draft !== file.text;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const request = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`${base}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "File operation failed");
    return data;
  }, [base]);
  const refresh = useCallback(async () => {
    const data = await request({ action: "list", path: folder });
    setEntries(data.entries);
  }, [request, folder]);
  useEffect(() => {
    let cancelled = false;
    void request({ action: "list", path: folder }).then(data => { if (!cancelled) { setEntries(data.entries); setError(null); } }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [request, folder]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; cancelled.current = false; setBusy(true); setError(null); setNotice(null);
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "File operation failed"); }
    finally { lock.current = false; setBusy(false); setProgress(null); }
  }
  const writable = canWrite && stopped && !busy;
  const selectedPath = (name: string) => folder ? `${folder}/${name}` : name;
  const discard = () => !file || file.text === null || file.text === draft || window.confirm("Discard your unsaved file edits?");
  async function open(path: string) {
    if (!discard()) return;
    const next = await request({ action: "stat", path });
    setFile(next); setDraft(next.text || ""); setHistory(null);
  }
  async function upload(uploaded: File) {
    if (uploaded.size > LIMIT) throw new Error("Browser uploads are limited to 64 MB per file.");
    const path = selectedPath(uploaded.name);
    let expectedEtag = "";
    if (entries?.some(entry => entry.name === uploaded.name)) {
      if (!window.confirm(`Replace ${uploaded.name}? Its current version will be saved in File history.`)) return;
      expectedEtag = (await request({ action: "stat", path })).etag;
    }
    if (!discard()) return;
    const session = await request({ action: "upload-begin", path, expectedEtag, bytes: uploaded.size });
    let committed = false;
    try {
      for (let offset = 0; offset < uploaded.size; offset += CHUNK) {
        if (cancelled.current) throw new Error("Upload cancelled. The saved file was not replaced.");
        setProgress(`Uploading ${Math.floor(offset / uploaded.size * 100)}%`);
        const bytes = new Uint8Array(await uploaded.slice(offset, offset + CHUNK).arrayBuffer());
        await request({ action: "upload-chunk", path, uploadId: session.uploadId, offset, contentBase64: base64(bytes) });
      }
      if (cancelled.current) throw new Error("Upload cancelled. The saved file was not replaced.");
      setProgress(null);
      setNotice("Finishing upload…");
      await request({ action: "upload-commit", path, uploadId: session.uploadId });
      committed = true;
    } finally {
      if (!committed) await request({ action: "upload-cancel", path, uploadId: session.uploadId }).catch(() => {});
    }
    setFile(null); await refresh(); setNotice("Uploaded. The file is available for the next server start.");
  }
  async function download(selected: OpenFile) {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < selected.bytes; offset += CHUNK) {
      if (cancelled.current) throw new Error("Download cancelled.");
      setProgress(`Downloading ${Math.floor(offset / selected.bytes * 100)}%`);
      const chunk = await request({ action: "read-chunk", path: selected.path, version: selected.version, offset });
      const bytes = Uint8Array.from(atob(chunk.contentBase64), char => char.charCodeAt(0));
      if (bytes.length !== Math.min(CHUNK, selected.bytes - offset)) throw new Error("Incomplete download. Please retry.");
      chunks.push(bytes);
    }
    if (cancelled.current) throw new Error("Download cancelled.");
    const url = URL.createObjectURL(new Blob(chunks));
    const link = document.createElement("a"); link.href = url; link.download = selected.path.split("/").at(-1)!;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="space-y-4">
    <div><h2 className="font-semibold">Saved files</h2><p className="mt-1 text-sm text-muted-foreground">Manage this server&apos;s saved worlds and data. Scripts, plugins, binaries, and sensitive files are excluded. Transfers are limited to 64 MB per file; text editing to 256 KB.</p></div>
    {!stopped ? <p className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">Stop the server before uploading, editing, deleting, or restoring files. You can browse and download while it runs; live files may change during download.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
    {progress ? <div className="flex items-center gap-3"><p role="status" className="text-sm">{progress}</p><button className={button} onClick={() => { cancelled.current = true; }}>Cancel transfer</button></div> : null}
    <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 break-all font-mono text-sm">Saved data / {folder}</span>
      {folder ? <button className={button} disabled={busy} onClick={() => { if (discard()) { setFolder(folder.split("/").slice(0, -1).join("/")); setFile(null); setEntries(null); } }}>Up a folder</button> : null}
      <button className={button} disabled={busy} onClick={() => void run(refresh)}>Refresh files</button>
      <button className={button} disabled={busy} onClick={() => void run(async () => { if (!discard()) return; setFile(null); setHistory((await request({ action: "history" })).history); })}>File history</button>
      {canWrite ? <><label className={`${button} ${writable ? "cursor-pointer" : "opacity-50"}`}>Upload file<input aria-label="Upload saved file" type="file" className="sr-only" disabled={!writable} onChange={event => { const uploaded = event.target.files?.[0]; event.target.value = ""; if (uploaded) void run(() => upload(uploaded)); }} /></label>
        <button className={button} disabled={!writable} onClick={() => { const name = window.prompt("New folder name"); if (name) void run(async () => { await request({ action: "mkdir", path: selectedPath(name) }); await refresh(); }); }}>New folder</button></> : null}
    </div>
    {entries ? <ul className="divide-y divide-border rounded-xl border border-border">{entries.length ? entries.map(entry => <li key={entry.name} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><button className="min-w-0 break-all text-left text-primary disabled:opacity-50" disabled={busy || (!entry.directory && (entry.bytes || 0) > LIMIT)} onClick={() => { if (entry.directory) { if (discard()) { setFolder(selectedPath(entry.name)); setFile(null); setHistory(null); setEntries(null); } } else void run(() => open(selectedPath(entry.name))); }}>{entry.directory ? "📁 " : ""}{entry.name}</button><span className="text-xs text-muted-foreground">{entry.directory ? "Folder" : `${((entry.bytes || 0) / 1024).toFixed(1)} KB${(entry.bytes || 0) > LIMIT ? " · above transfer limit" : ""}`}</span></li>) : <li className="p-3 text-sm text-muted-foreground">No supported files in this folder.</li>}</ul> : <p role="status" className="text-sm">{error ? "Use Refresh files to retry." : "Loading files…"}</p>}
    {file ? <div className="space-y-3 rounded-xl border border-border bg-card p-4"><h3 className="break-all font-semibold">{file.path}</h3>
      {file.text !== null ? <label className="block text-sm">File content<textarea aria-label="File content" className="mt-2 min-h-64 w-full rounded border border-border bg-background p-3 font-mono text-xs" value={draft} disabled={!writable} onChange={event => setDraft(event.target.value)} /></label> : <p className="text-sm text-muted-foreground">Binary or large text file. Download it to view its contents.</p>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void run(() => download(file))}>Download file</button>
      {canWrite && file.text !== null ? <button className={button} disabled={!writable || draft === file.text} onClick={() => void run(async () => { const bytes = new TextEncoder().encode(draft); if (bytes.length > 256 * 1024) throw new Error("Text editing is limited to 256 KB."); const contentBase64 = base64(bytes); const result = await request({ action: "write", path: file.path, expectedEtag: file.etag, contentBase64 }); setFile({ ...(await request({ action: "stat", path: file.path })), etag: result.etag }); await refresh(); setNotice("Saved. The previous version is in File history."); })}>Save file</button> : null}
      {canWrite ? <button className={`${button} text-destructive`} disabled={!writable} onClick={() => { if (window.confirm(`Delete ${file.path}? A recoverable copy is retained in File history.`)) void run(async () => { await request({ action: "delete", path: file.path, expectedEtag: file.etag }); setFile(null); await refresh(); setNotice("Deleted. Restore it from File history if needed."); }); }}>Delete file</button> : null}</div></div> : null}
    {history ? <div className="space-y-2"><h3 className="font-semibold">File history</h3><p className="text-xs text-muted-foreground">The 50 most recent replaced or deleted files are retained on this server. This history is separate from world backups.</p>{history.length ? history.map(revision => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3 text-sm"><span className="min-w-0 break-all">{revision.path}<small className="block text-muted-foreground">{new Date(revision.at).toLocaleString()}</small></span>{canWrite ? <button className={button} disabled={!writable} onClick={() => { if (window.confirm(`Restore ${revision.path} to this version?`)) void run(async () => { let expectedEtag = ""; const containing = revision.path.split("/").slice(0, -1).join("/"); const listed = await request({ action: "list", path: containing }); if (listed.entries.some((entry: Entry) => entry.name === revision.path.split("/").at(-1))) expectedEtag = (await request({ action: "stat", path: revision.path })).etag; await request({ action: "restore", path: revision.path, revision: revision.id, expectedEtag }); await refresh(); setHistory((await request({ action: "history" })).history); setNotice("File restored."); }); }}>Restore file</button> : null}</div>) : <p className="text-sm">No file revisions yet.</p>}</div> : null}
  </section>;
}
