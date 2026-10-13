"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { availableAt, commonAvailability, emptyAvailability, type Availability } from "@/lib/friends/availability";
import { pageHref } from "@/lib/designPreview";
import { supportsMultiplayer } from "@/lib/multiplayer/support";

type Game = { slug: string; title: string; features?: string[]; tags?: string[] };
type Friend = { id: string; username: string; availability: Availability; sharedGames: { slug: string; title: string }[] };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50";
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const minuteText = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const parseMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function PlayAvailabilityPanel({ games = [], compact = false }: { games?: Game[]; compact?: boolean }) {
  const router = useRouter();
  const [availability, setAvailability] = useState<Availability>(emptyAvailability());
  const [draft, setDraft] = useState<Availability>(emptyAvailability());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [game, setGame] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/friends/availability", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load availability. Please try again.");
      const data = await response.json();
      const saved = data.availability as Availability;
      const initial = saved.weekly.length || saved.window ? saved : { ...saved, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      setAvailability(initial); setDraft(initial);
      setFriends(data.friends); setNow(Date.now());
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoadFailed(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [loadKey]);
  async function save(next: Availability) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/friends/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save availability");
      setAvailability(data.availability); setDraft(data.availability); setNotice(data.availability.publishLooking ? "Saved. You’ll appear in Looking to Party during your play windows." : "Availability saved. Only your friends can see it."); setNow(Date.now());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save availability"); }
    finally { setBusy(false); }
  }
  function preset(tonight: boolean) {
    const starts = new Date();
    if (tonight) { starts.setHours(19, 0, 0, 0); if (starts.getTime() < Date.now()) starts.setTime(Date.now()); }
    const ends = new Date(starts.getTime() + 2 * 3600_000);
    setStart(localInput(starts)); setEnd(localInput(ends));
    void save({ ...availability, window: { startsAt: starts.toISOString(), endsAt: ends.toISOString() } });
  }
  const chosen = friends.filter(friend => selected.includes(friend.id));
  const overlap = useMemo(() => selected.length ? commonAvailability([availability, ...friends.filter(friend => selected.includes(friend.id)).map(friend => friend.availability)], now, duration) : [], [availability, friends, selected, now, duration]);
  const multiplayer = games.filter(supportsMultiplayer).sort((a, b) => a.title.localeCompare(b.title));
  const shared = multiplayer.filter(item => chosen.length && chosen.every(friend => friend.sharedGames.some(sharedGame => sharedGame.slug === item.slug)));
  const freeToday = useMemo(() => {
    const endOfDay = new Date(now); endOfDay.setHours(24, 0, 0, 0);
    return friends.flatMap(friend => {
      for (let time = now; time < endOfDay.getTime(); time += 15 * 60_000) {
        if (availableAt(friend.availability, time)) return [{ ...friend, freeAt: time }];
      }
      return [];
    });
  }, [friends, now]);
  const format = (time: string) => new Date(time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: availability.timezone });
  async function createEvent() {
    if (busy) return;
    const time = Date.parse(eventTime);
    if (!chosen.length || !game || !Number.isFinite(time) || time <= now || !overlap.some(slot => time >= Date.parse(slot.startsAt) && time + duration * 60_000 <= Date.parse(slot.endsAt))) { setError("Choose a game and a future time that fits everyone’s availability."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || `${multiplayer.find(item => item.slug === game)?.title} with friends`, gameSlug: game, eventType: "game_night", hostType: "community", visibility: "unlisted", startsAt: new Date(time).toISOString(), endsAt: new Date(time + duration * 60_000).toISOString(), timezone: availability.timezone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create event");
      router.push(pageHref(`/events/${data.event.id}`));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create event"); }
    finally { setBusy(false); }
  }
  if (loading) return <section className="rounded-2xl border border-border bg-card p-5" aria-busy="true">Loading play availability…</section>;
  if (loadFailed) return <section className="rounded-2xl border border-border bg-card p-5"><p role="alert">{error}</p><button className={button} onClick={() => { setLoading(true); setLoadFailed(false); setError(""); setLoadKey(loadKey + 1); }}>Retry availability</button></section>;
  return <section className="play-availability-panel space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Who can play tonight?</h2><p className="mt-1 text-sm text-muted-foreground">Share a time with friends, or find a time together.</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => { setLoading(true); setError(""); setNotice(""); setLoadKey(loadKey + 1); }}>Refresh availability</button>{!compact && <button className={button} onClick={() => setEditOpen(!editOpen)}>{editOpen ? "Close availability" : "Set my availability"}</button>}</div></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {availability.window && Date.parse(availability.window.endsAt) > now && <p className="text-sm">Your next window: {format(availability.window.startsAt)} – {format(availability.window.endsAt)}</p>}
    <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => preset(false)}>Free now · 2 hours</button><button className={button} disabled={busy} onClick={() => preset(true)}>Free tonight · 2 hours</button>{!compact && <button className={button} disabled={busy} onClick={() => void save(emptyAvailability(availability.timezone))}>Stop sharing availability</button>}</div>
    {!compact && editOpen && <div className="space-y-4 rounded-xl bg-secondary/25 p-4">
      <p className="text-sm text-muted-foreground">Your full schedule stays friends-only. One-time windows expire automatically. Your usual week stays saved until you change it. Appear offline and Hide activity also hide availability and automatic Looking to Party listings.</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (!start || !end) return; void save({ ...draft, window: { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() } }); }}>
        <label className="grid gap-1 text-sm">From · your device time<input type="datetime-local" className={field} value={start} onChange={event => setStart(event.target.value)} required /></label><label className="grid gap-1 text-sm">Until<input type="datetime-local" className={field} value={end} onChange={event => setEnd(event.target.value)} required /></label><button className={button} disabled={busy}>Save this window</button>
      </form>
      <label className="grid max-w-sm gap-1 text-sm">Weekly timezone<input className={field} value={draft.timezone} onChange={event => setDraft({ ...draft, timezone: event.target.value })} placeholder="America/Chicago" /></label>
      <h3 className="font-semibold">My usual week</h3>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={!!draft.publishLooking} onChange={event => setDraft({ ...draft, publishLooking: event.target.checked })} /><span>Show me in Looking to Party during my play windows<small className="mt-1 block text-muted-foreground">Signed-in players can see your name and installed games while you’re available. Your full schedule stays friends-only. Save below to apply.</small></span></label>
      <p className="text-xs text-muted-foreground">Choose daytime or evening windows. For overnight availability, use a window on each day.</p>
      <div className="grid gap-2">{[1, 2, 3, 4, 5, 6, 0].map(day => {
        const slot = draft.weekly.find(item => item.day === day);
        const change = (patch: Partial<Availability["weekly"][number]>) => setDraft({ ...draft, weekly: [...draft.weekly.filter(item => item.day !== day), { day, startMinute: 19 * 60, endMinute: 22 * 60, ...slot, ...patch }] });
        return <div key={day} className="flex flex-wrap items-center gap-3"><label className="flex w-32 items-center gap-2 text-sm"><input type="checkbox" checked={!!slot} onChange={event => event.target.checked ? change({}) : setDraft({ ...draft, weekly: draft.weekly.filter(item => item.day !== day) })} />{days[day]}</label>{slot && <><input aria-label={`${days[day]} start`} className={field} type="time" value={minuteText(slot.startMinute)} onChange={event => change({ startMinute: parseMinute(event.target.value) })} /><span>to</span><input aria-label={`${days[day]} end`} className={field} type="time" value={minuteText(slot.endMinute)} onChange={event => change({ endMinute: parseMinute(event.target.value) })} /></>}</div>;
      })}</div><button className={button} disabled={busy} onClick={() => void save(draft)}>Save my usual week</button>
    </div>}
    <div className="flex flex-wrap gap-2">{freeToday.map(friend => <span key={friend.id} className="rounded-full bg-primary/10 px-3 py-1 text-sm">{friend.username} · {friend.freeAt === now ? "free now" : `free at ${new Date(friend.freeAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}</span>)}</div>
    {!freeToday.length && <p className="text-sm text-muted-foreground">No friends have shared an available time today yet.</p>}
    {compact ? <Link href="/friends" className="inline-flex text-sm font-bold text-primary">Find a time with friends →</Link> : <div className="space-y-4 border-t border-border pt-5">
      <h3 className="font-bold">Find a time together</h3><p className="text-sm text-muted-foreground">Select friends to find a shared window in the next seven days. Times below are in {availability.timezone}.</p>
      {!friends.length && <p className="text-sm text-muted-foreground">Add friends to start planning together.</p>}
      <div className="flex flex-wrap gap-3">{friends.map(friend => <label key={friend.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(friend.id)} onChange={event => { setSelected(event.target.checked ? [...selected, friend.id] : selected.filter(id => id !== friend.id)); setEventTime(""); }} />{friend.username}{!friend.availability.weekly.length && !friend.availability.window && <span className="text-xs text-muted-foreground">hasn’t shared a time</span>}</label>)}</div>
      <label className="flex items-center gap-2 text-sm">Session length<select className={field} value={duration} onChange={event => { setDuration(Number(event.target.value)); setEventTime(""); }}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></label>
      {!!chosen.length && !overlap.length && <p className="text-sm text-muted-foreground">No shared window yet. Everyone needs to save availability that overlaps.</p>}
      {!!overlap.length && <><div className="flex flex-wrap gap-2">{overlap.slice(0, 10).map(slot => <button key={slot.startsAt} className={`${button} ${eventTime === slot.startsAt ? "border-primary bg-primary/10" : ""}`} aria-pressed={eventTime === slot.startsAt} onClick={() => setEventTime(slot.startsAt)}>{format(slot.startsAt)} – {format(slot.endsAt)}</button>)}</div>
        <p className="text-sm text-muted-foreground">Choose a window to start at its earliest available time, or pick another time inside it.</p>
        <label className="grid max-w-sm gap-1 text-sm">Start · your device time<input className={field} type="datetime-local" value={eventTime ? localInput(new Date(eventTime)) : ""} onChange={event => setEventTime(event.target.value ? new Date(event.target.value).toISOString() : "")} /></label>
        <label className="grid max-w-sm gap-1 text-sm">Game<select className={field} value={game} onChange={event => setGame(event.target.value)}><option value="">Choose a multiplayer game</option>{shared.length > 0 && <optgroup label="Installed for everyone">{shared.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</optgroup>}<optgroup label="Other multiplayer games">{multiplayer.filter(item => !shared.some(common => common.slug === item.slug)).map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}</optgroup></select></label>
        <label className="grid max-w-xl gap-1 text-sm">Event name · optional<input className={field} maxLength={150} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <p className="text-xs text-muted-foreground">Creates an unlisted Game Night. Anyone with its link can view it. Share the link with your friends so they can RSVP; it won’t appear in public event listings.</p>
        <button className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50" disabled={busy || !eventTime || !game} onClick={() => void createEvent()}>{busy ? "Saving…" : "Create Game Night"}</button>
      </>}
    </div>}
  </section>;
}
