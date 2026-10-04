"use client";
import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";

type Track = { tapeId: string; title: string; artist: string; album: string; genre: string; bio: string; audioUrl: string; coverUrl: string; website: string; bandcamp: string; spotify: string; discountCode: string; discountPercent: string | number; year: string | number; starter: boolean; enabled: boolean };
const blank: Track = { tapeId: "", title: "", artist: "", album: "", genre: "", bio: "", audioUrl: "", coverUrl: "", website: "", bandcamp: "", spotify: "", discountCode: "", discountPercent: "", year: "", starter: false, enabled: true };
export function MixtapeEditor() {
  const [tracks, setTracks] = useState<Track[]>([]), [form, setForm] = useState<Track>({ ...blank });
  const [menu, setMenu] = useState(""), [filter, setFilter] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ name: string; key: "audioUrl" | "coverUrl" } | null>(null);
  const [tester, setTester] = useState("");
  const [players, setPlayers] = useState(0), [holdings, setHoldings] = useState<Record<string, number>>({});
  async function load() {
    const res = await fetch("/api/admin/mixtape"); const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Cannot load library");
    setTracks(data.tracks); setMenu(data.settings?.menuTapeId || "");
    setPlayers(data.stats?.players || 0); setHoldings(Object.fromEntries((data.stats?.holdings || []).map((r: { _id: string; count: number }) => [r._id, r.count])));
  }
  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);
  async function save(body: unknown) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/mixtape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      await load(); setMessage("Saved");
      if (data.track) setForm({ ...blank, ...data.track });
    } catch (err) { setMessage(err instanceof Error ? err.message : "Save failed"); } finally { setBusy(false); }
  }
  async function fileUpload(file: File | undefined, key: "audioUrl" | "coverUrl") {
    if (!file || busy) return; setBusy(true); setMessage("Checking file�");
    let name = "";
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
      const prepare = await fetch("/api/admin/mixtape/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size, sha256 }) });
      const ticket = await prepare.json(); if (!prepare.ok) throw new Error(ticket.error);
      name = ticket.name;
      await upload(ticket.pathname, file, { access: "public", contentType: ticket.contentType, handleUploadUrl: "/api/admin/mixtape/upload/staging", multipart: true,
        onUploadProgress: ({ percentage }) => setMessage(`Uploading ${file.name}: ${Math.round(percentage)}%`),
      });
      const call = async (action: string) => {
        const response = await fetch("/api/admin/mixtape/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, name }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
      };
      let result = await call("archive");
      for (let i = 0; i < 180 && result.state !== "ready"; i++) {
        setMessage(result.message || "Verifying upload�");
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        result = await call("status");
      }
      if (result.state !== "ready") throw new Error("Upload is still processing. Retry completion below.");
      setForm(prev => ({ ...prev, [key]: result.url })); setMessage("Uploaded and verified in R2; save the tape to add it to the library");
      setPendingUpload(null);
    } catch (err) {
      if (name) setPendingUpload({ name, key });
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); }
  }
  async function resumeUpload() {
    if (!pendingUpload || busy) return; setBusy(true);
    try {
      let ready = false;
      for (let i = 0; i < 180; i++) {
        const response = await fetch("/api/admin/mixtape/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", name: pendingUpload.name }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        if (result.state === "ready") { setForm(prev => ({ ...prev, [pendingUpload.key]: result.url })); setPendingUpload(null); setMessage("Uploaded and verified in R2; save the tape"); ready = true; break; }
        setMessage(result.message || "Verifying upload�");
        await new Promise(resolve => window.setTimeout(resolve, 2000));
      }
      if (!ready) throw new Error("Upload is still processing. Retry completion below.");
    } catch (err) { setMessage(err instanceof Error ? err.message : "Upload failed"); } finally { setBusy(false); }
  }
  const field = (key: keyof Track, label: string) => <label key={key} className="block text-sm">{label}<input className="mt-1 w-full rounded border bg-background p-2" value={String(form[key] ?? "")} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  const base = tracks.filter(t => t.enabled && t.audioUrl && t.starter).length, pool = tracks.filter(t => t.enabled && t.audioUrl && !t.starter).length;
  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-3xl font-bold">HyperDisc Mixtape Engine</h1>
    <p>{base} of 5 base tapes · {pool} other tapes · {players} collectors · 100-track launch target. Starter packs become available with exactly 5 base tapes and at least 15 other tapes.</p>
    <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">Menu music</h2>
      <p>Upload and save a track below, then select it here for the title and menu screens. It is independent of each player&apos;s match deck.</p>
      <select aria-label="Menu music" className="rounded border bg-background p-2" value={menu} onChange={e => setMenu(e.target.value)}><option value="">No menu music</option>{tracks.filter(t => t.enabled && t.audioUrl).map(t => <option key={t.tapeId} value={t.tapeId}>{t.title || "Untitled track"}{t.artist ? ` — ${t.artist}` : ""}</option>)}</select>
      <button disabled={busy} className="ml-3 rounded border px-4 py-2" onClick={() => save({ action: "menu", tapeId: menu })}>Save menu music</button>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="text-xl font-bold">Tester starter packs</h2><p>Re-roll a tester&apos;s collection and six-tape deck. The previous collection is archived. Regular player accounts cannot be reset here.</p><input aria-label="Tester username" className="rounded border bg-background p-2" placeholder="Tester username" value={tester} onChange={e => setTester(e.target.value)} /><button disabled={busy || !tester} className="ml-3 rounded border px-4 py-2" onClick={() => { if (window.confirm(`Reinitialize ${tester}'s test collection?`)) save({ action: "reset-tester", username: tester }); }}>Reinitialize tester</button></section>
    <p role="status">{message}</p>
    {pendingUpload && <button disabled={busy} className="rounded border px-4 py-2" onClick={resumeUpload}>Retry upload completion</button>}
    <form className="space-y-4 rounded border p-4" onSubmit={e => { e.preventDefault(); save(form); }}>
      <h2 className="text-xl font-bold">{form.tapeId ? "Edit tape" : "Add tape"}</h2>
      <p>All fields are optional. You can save a partial entry and finish it later. Tracks become playable once audio is added.</p>
      <div className="grid gap-4 sm:grid-cols-2">{field("title", "Track title")}{field("artist", "Artist")}{field("album", "Album")}{field("year", "Release year")}{field("genre", "Genre")}{field("bio", "Artist biography")}{field("website", "Official website")}{field("bandcamp", "Bandcamp / store link")}{field("spotify", "Spotify")}{field("discountCode", "Artist discount code")}{field("discountPercent", "Discount percent (10–20)")}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); fileUpload(e.dataTransfer.files[0], "audioUrl"); }} className="rounded border border-dashed p-4"><label>Drop audio or choose a file (OGG, MP3, WAV)<input disabled={busy} type="file" accept=".ogg,.mp3,.wav" onChange={e => fileUpload(e.target.files?.[0], "audioUrl")} /></label>{field("audioUrl", "Audio URL")}</div>
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); fileUpload(e.dataTransfer.files[0], "coverUrl"); }} className="rounded border border-dashed p-4"><label>Drop cover art or choose a file (PNG, JPG)<input disabled={busy} type="file" accept=".png,.jpg,.jpeg" onChange={e => fileUpload(e.target.files?.[0], "coverUrl")} /></label>{field("coverUrl", "Cover URL")}</div>
      </div>
      <label className="mr-6"><input type="checkbox" checked={form.starter} onChange={e => setForm({ ...form, starter: e.target.checked })} /> Universal base tape</label>
      <label><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Available</label>
      <p>Upload music and artwork approved by the artist for use in HyperDisc. Enter only discount codes supplied by the artist.</p>
      {form.audioUrl && <audio controls src={form.audioUrl} className="w-full" />}
      <button disabled={busy} className="rounded border px-4 py-2">Save tape</button><button type="button" className="ml-3 rounded border px-4 py-2" onClick={() => setForm({ ...blank })}>New tape</button>
    </form>
    <section><h2 className="mb-3 text-xl font-bold">Track library</h2><input aria-label="Filter tracks" placeholder="Filter title, artist, genre" className="mb-3 w-full rounded border bg-background p-2" value={filter} onChange={e => setFilter(e.target.value)} />
      {tracks.filter(t => `${t.title} ${t.artist} ${t.genre}`.toLowerCase().includes(filter.toLowerCase())).map(t => <article key={t.tapeId} className="mb-3 flex flex-wrap items-center gap-4 rounded border p-3"><strong>{t.title}</strong><span>{t.artist} · {t.genre} {t.starter ? "· BASE" : ""} {!t.enabled ? "· UNAVAILABLE" : ""} · {holdings[t.tapeId] || 0} collections</span><audio controls preload="none" src={t.audioUrl} /><button className="rounded border px-3 py-1" onClick={() => setForm({ ...blank, ...t })}>Edit</button></article>)}
      {!tracks.length && <p>No tapes yet. Upload the first artist track above.</p>}
    </section>
  </div>;
}
