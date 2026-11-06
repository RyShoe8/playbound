"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Availability } from "@/lib/friends/availability";
import { acceptsGame, nextPlayTime, defaultPlayPreferences, type MatchGame, type PlayPreferences } from "@/lib/friends/playPreferences";

type Friend = { id: string; username: string; online: boolean; availability: Availability; preferences?: PlayPreferences; recentGames?: string[]; sharedGames: {slug: string; editionSlug?: string}[] };
type Snapshot = { recentGames?: string[]; availability: Availability; preferences?: PlayPreferences; friends: Friend[] };
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Could not complete the request.");
  return data;
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const step = 15 * 60000;

export function HomePlayTogether({ games }: { games: MatchGame[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [partyId, setPartyId] = useState("");
  const [now, setNow] = useState(0);
  const [when, setWhen] = useState(0);
  const planner = useRef<HTMLDialogElement>(null);
  const [planningAt, setPlanningAt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState(false);
  const [prefs, setPrefs] = useState(defaultPlayPreferences);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const writeVersion = useRef(0);
  const [plans, setPlans] = useState<Record<number,string>>({});
  const [sent, setSent] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    let lastAttempt = 0;
    let pending = false;
    let initialized = false;
    async function refreshFriends() {
      if (document.hidden || pending || Date.now() - lastAttempt < 120000) return;
      lastAttempt = Date.now();
      pending = true;
      const version = writeVersion.current;
      try {
        const data = await request("/api/friends/availability");
        if (!active || version !== writeVersion.current || version % 2) return;
        setNow(Date.now());
        setSnapshot(data);
        if (!initialized) {
          initialized = true;
          const reply = new URLSearchParams(location.search).get("friend");
          if (reply && data.friends.some((f: Friend) => f.id === reply)) setSelected(reply);
        }
      } catch (error) {
        if (active && !initialized) setNotice(error instanceof Error ? error.message : "Could not load friends.");
      } finally {
        pending = false;
      }
    }
    void refreshFriends();
    void request("/api/parties?discoverable=0").then(parties => {
      if (active) setPartyId(parties.myParties[0]?.id || "");
    }).catch(() => {});
    document.addEventListener("visibilitychange", refreshFriends);
    const tick = setInterval(() => { void refreshFriends(); const t = Date.now(); setNow(t); setWhen(old => old < t ? 0 : old); }, 30000);
    return () => { active = false; clearInterval(tick); document.removeEventListener("visibilitychange", refreshFriends); };
  }, []);
  async function run(work: () => Promise<string>) {
    if (busy) return;
    writeVersion.current++; setBusy(true); setNotice("");
    try { setNotice(await work()); } catch(e) { setNotice(e instanceof Error ? e.message : "Please try again."); }
    finally { writeVersion.current++; setBusy(false); }
  }
  useEffect(() => {
    if (edit && !dialog.current?.open) dialog.current?.showModal();
    if (!edit && dialog.current?.open) dialog.current.close();
  }, [edit]);
  const online = snapshot?.friends.filter(f=>f.online) || [];
  const slots = now ? Array.from({length:24}, (_, i) => (Math.floor(now / step) + 1 + i) * step) : [];
  const activePrefs = snapshot?.preferences || defaultPlayPreferences;
  const matches = (snapshot?.friends || []).flatMap(friend => {
    const p = friend.preferences || defaultPlayPreferences;
    const shared = new Set(friend.sharedGames.map(g => g.slug));
    const acceptable = games.filter(g => acceptsGame(activePrefs, g) && acceptsGame(p, g));
    const game = acceptable.find(g => shared.has(g.slug)) || acceptable.find(g => g.free && activePrefs.downloads && p.downloads);
    if (!game) return [];
    const at = nextPlayTime(friend.availability, when || now, now + 6 * 3600000);
    return at ? [{ friend, game, at, installed:shared.has(game.slug) }] : [];
  }).sort((a,b) => a.at-b.at || Number(b.installed)-Number(a.installed) || a.friend.username.localeCompare(b.friend.username));
  const target = snapshot?.friends.find(f => f.id === selected);
  const chosen = matches.find(m => m.friend.id === selected);
  async function plan(at: number, gameSlug?: string) {
    if (plans[at]) return plans[at];
    const res = await request("/api/events","POST",{title:"Play together with friends", plannedParty:true, gameSlug, eventType:"party", visibility:"unlisted", hostType:"community", startsAt:new Date(at).toISOString(), endsAt:new Date(at+7200000).toISOString(), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
    const id = res.event.id; setPlans(old => ({...old,[at]:id})); return id;
  }
  async function invite(friend: Friend, at: number, slug?: string) {
    if (at > now) {
      const id = await plan(at, slug);
      await request("/api/friends/message","POST",{friendId:friend.id,eventId:id,message:`Join my party on ${new Date(at).toLocaleString([], { weekday:"short", hour:"numeric", minute:"2-digit", timeZoneName:"short" })}. Open the invitation to RSVP.`});
    } else {
      const list = await request("/api/parties?discoverable=0");
      const editionSlug = friend.sharedGames.find(g => g.slug === slug)?.editionSlug;
      const party = list.myParties[0] || (await request("/api/parties","POST",{gameSlug:slug,editionSlug,visibility:"friends"})).party;
      setPartyId(party.id);
      const result = await request(`/api/parties/${party.id}/invite`,"POST",{friendIds:[friend.id]});
      if (result.results[0]?.status !== 201) throw Error(result.results[0]?.error || "Invite failed.");
    }
    setSent(old => [...old,friend.id+":"+ (at > now ? at : 0)]);
    return `Invitation sent to ${friend.username}.`;
  }
  const pick = (id:string) => { setSelected(id); setMessage(""); };
  const at = chosen?.at || when || now;
  const alreadySent = sent.includes(selected+":"+(at > now ? at : 0));
  const style = "new-button";
  return <section className="new-panel new-pad home-play-panel">
    <h2>Play together</h2>
    <label>When <select value={when} onChange={e=>setWhen(Number(e.target.value))}><option value={0}>Now</option>{slots.map(t=><option key={t} value={t}>{new Date(t).getDate() !== new Date(now).getDate() ? "Tomorrow · " : ""}{clock(t)}</option>)}</select></label>
    <div className="home-play-actions">{when ? <button disabled={busy} className={style} onClick={()=>{setPlanningAt(when);setNotice("");planner.current?.showModal();}}>{plans[when] ? "View party plan" : "Plan a party"}</button> : <Link className={style} href={partyId ? `/party/${partyId}` : "/multiplayer?startParty=1"}>{partyId ? "Open your party" : "Start a Party"}</Link>}
    <button disabled={busy || !snapshot} className="new-button primary" onClick={()=>void run(async()=>{
      const start = when || Date.now();
      const result = await request("/api/friends/availability","PATCH",{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone, window:{startsAt:new Date(start).toISOString(),endsAt:new Date(start+7200000).toISOString()}});
      setSnapshot(old=>old && {...old,availability:{...old.availability,window:result.window}});return "Availability shared for two hours.";
    })}>{when ? `Free at ${clock(when)}` : "Free to Play Now"}</button></div>
    <dialog ref={planner} className="home-play-dialog party-plan" aria-labelledby="party-plan-title" onClose={()=>setPlanningAt(0)}>
      <h2 id="party-plan-title">{plans[planningAt] ? "Your party is planned" : "Plan a party"}</h2>
      <p>{new Date(planningAt).toLocaleDateString([], {weekday:"long", month:"short", day:"numeric"})} · {clock(planningAt)} – {clock(planningAt + 7200000)}</p>
      <p>{plans[planningAt] ? "Open the party details or choose a friend to invite." : "Create an unlisted party, then invite your friends."}</p>
      {notice && <p role="status">{notice}</p>}
      <div className="home-play-dialog-actions">
        {plans[planningAt] ? <Link className="new-button primary" href={`/events/${plans[planningAt]}`}>Open party</Link> :
          <button className="new-button primary" disabled={busy} onClick={()=>void run(async()=>{await plan(planningAt);return "";})}>{busy ? "Creating party…" : "Create party"}</button>}
        <button className="new-button" onClick={()=>planner.current?.close()}>{plans[planningAt] ? "Back to friends" : "Close"}</button>
      </div>
    </dialog>    {snapshot?.availability.window && Date.parse(snapshot.availability.window.endsAt)>now && <p>Your window · {clock(Date.parse(snapshot.availability.window.startsAt))} – {clock(Date.parse(snapshot.availability.window.endsAt))} <button onClick={()=>void run(async()=>{await request("/api/friends/availability","PATCH",{timezone:snapshot.availability.timezone,window:null});setSnapshot(old=>old && {...old,availability:{...old.availability,window:null}});return "Window cleared.";})} disabled={busy}>Clear</button></p>}
    {when > 0 && plans[when] ? <Link href={`/events/${plans[when]}`}>Open scheduled party →</Link> : null}
    <h3>Friends online</h3>
    {snapshot ? online.length ? <div className="home-play-actions">{online.map(f=><button key={f.id} onClick={()=>pick(f.id)}>{f.username}</button>)}</div> : <p>No friends online right now.</p> : <p>Loading friends…</p>}
    <div><h3>Play preferences</h3><button disabled={!snapshot} onClick={()=>{setNotice("");setPrefs(activePrefs);setEdit(!edit);}}>{edit?"Close":"Edit"}</button></div>
    <p>{activePrefs.mode==="any"?"Any multiplayer game":activePrefs.mode==="genres"?activePrefs.genres.join(", "):games.filter(g=>activePrefs.games.includes(g.slug)).map(g=>g.title).join(", ")} · {activePrefs.downloads?"Open to downloads":"Installed games"}</p>
    <dialog ref={dialog} className="home-play-dialog" aria-label="Play preferences" onCancel={()=>setEdit(false)} onClose={()=>setEdit(false)}><fieldset className="play-pref-sheet"><legend>Choose play preferences</legend><label>Games <select value={prefs.mode} onChange={e=>setPrefs({...prefs,mode:e.target.value as PlayPreferences["mode"]})}><option value="any">Any multiplayer game</option><option value="genres">Choose genres</option><option value="games">Choose games</option></select></label>
    {prefs.mode!=="any" && <><input aria-label="Filter options" placeholder="Search options" value={query} onChange={e=>setQuery(e.target.value)}/><div className="home-play-options">{(prefs.mode==="genres"?[...new Set(games.flatMap(g=>g.genres))].sort().map(name=>({slug:name,title:name})):games).filter(g=>g.title.toLowerCase().includes(query.toLowerCase())).map(g=>{const key=prefs.mode==="genres"?"genres":"games";return <label key={g.slug}><input type="checkbox" checked={prefs[key].includes(g.slug)} onChange={e=>setPrefs({...prefs,[key]:e.target.checked?[...prefs[key],g.slug]:prefs[key].filter(id=>id!==g.slug)})}/>{g.title}</label>;})}</div></>}
    <label><input type="checkbox" checked={prefs.downloads} onChange={e=>setPrefs({...prefs,downloads:e.target.checked})}/> Open to downloading free games</label>
    <div className="home-play-dialog-actions"><button className="new-button primary" disabled={busy} onClick={()=>void run(async()=>{const data=await request("/api/friends/availability","PATCH",prefs);setSnapshot(old=>old && {...old,preferences:data.preferences});setEdit(false);return "Preferences saved.";})}>Save preferences</button><button className="new-button" onClick={()=>setEdit(false)}>Cancel</button></div>{edit && notice && <p role="status">{notice}</p>}</fieldset></dialog>
    {!!snapshot?.recentGames?.length && <p>Recently played · {snapshot.recentGames.join(", ")}</p>}
    <h3>Next available</h3>
    {matches.slice(0,3).map(({friend,game,at:t,installed}, index)=><div key={friend.id}><button onClick={()=>pick(friend.id)}><strong>{friend.username}</strong> · {t===now?"Free now":clock(t)}<small>{game.title} · {installed?"Both installed":"Free download"}</small></button>{index===0 && <button className={style} disabled={busy || sent.includes(friend.id+":"+(t>now?t:0))} onClick={()=>void run(()=>invite(friend,t,game.slug))}>{sent.includes(friend.id+":"+(t>now?t:0))?"Invited":"Invite"}</button>}</div>)}
    {snapshot && !matches.length && <p>No matching friends in the next six hours.</p>}
    {target && <div><h3>{target.username}</h3><p>{target.recentGames?.length ? "Recently played · "+target.recentGames.join(", "):""}</p><button className={style} disabled={busy || alreadySent} onClick={()=>void run(()=>invite(target,at,chosen?.game.slug))}>{alreadySent?"Invited":at>now?`Invite for ${clock(at)}`:"Invite to party"}</button>
    <label>Message <input maxLength={500} value={message} onChange={e=>setMessage(e.target.value)} /></label><button disabled={busy || !message.trim()} onClick={()=>void run(async()=>{await request("/api/friends/message","POST",{friendId:selected,message});setMessage("");return "Message sent.";})}>Send message</button></div>}
    {!edit && !planningAt && notice && <p role="status">{notice}</p>}
    <div><Link href="/friends">Friends & schedule →</Link></div>
  </section>;
}
