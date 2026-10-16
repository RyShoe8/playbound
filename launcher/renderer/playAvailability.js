/*
 * "Who can play tonight?" for the launcher Friends page.
 *
 * The same planner the website's Friends page has (PlayAvailabilityPanel):
 * share a window or your usual week, see which friends are free today, and
 * find a time everyone you pick can play and turn it into an unlisted Game
 * Night. It talks to the same /api/friends/availability route, through two
 * small IPC calls, so a window saved here shows up on the web and the other
 * way round. The overlap maths mirrors lib/friends/availability.ts.
 */
import { escapeHtml } from './shared.js';
import { catalogGameSupportsParty } from './partyGameEligibility.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const emptyAvailability = (timezone = 'UTC') => ({ timezone, window: null, weekly: [] });
const formatters = new Map();

export function availableAt(availability, time) {
  const w = availability.window;
  if (w && Date.parse(w.startsAt) <= time && time < Date.parse(w.endsAt)) return true;
  if (!availability.weekly.length) return false;
  let formatter = formatters.get(availability.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: availability.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (formatters.size > 64) formatters.clear();
    formatters.set(availability.timezone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  const minute = Number(value('hour')) * 60 + Number(value('minute'));
  return availability.weekly.some((slot) => slot.day === day && minute >= slot.startMinute && minute < slot.endMinute);
}

/** Scan real instants, then compare local wall time, so timezones and DST stay local to each person. */
export function commonAvailability(people, now = Date.now(), durationMinutes = 60) {
  if (!people.length) return [];
  const step = 60000, duration = durationMinutes * 60000;
  const start = Math.ceil(now / step) * step, horizon = now + 7 * 86400000;
  const slots = [];
  let runStart = null;
  for (let time = start; time <= horizon; time += step) {
    const ok = time < horizon && people.every((p) => availableAt(p, time) && availableAt(p, time + step - 1));
    if (ok && runStart === null) runStart = time;
    if (!ok && runStart !== null) {
      if (time - runStart >= duration) slots.push({ startsAt: new Date(runStart).toISOString(), endsAt: new Date(time).toISOString() });
      runStart = null;
    }
  }
  return slots;
}

const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const minuteText = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const parseMinute = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function mountPlayAvailability(host) {
  if (!host || host.dataset.mounted === '1') return;
  host.dataset.mounted = '1';
  const s = {
    loading: true, failed: false, busy: false, error: '', notice: '', editOpen: false,
    availability: emptyAvailability(), draft: emptyAvailability(), friends: [],
    selected: new Set(), duration: 60, eventTime: '', game: '', title: '', start: '', end: '',
    games: [], now: Date.now(),
  };

  async function load() {
    s.loading = true; s.failed = false; s.error = ''; paint();
    try {
      const data = await window.playbound.getPlayAvailability?.();
      if (!data || data.error) throw new Error(data?.error || 'Could not load availability. Please try again.');
      const saved = data.availability || emptyAvailability();
      const initial = saved.weekly.length || saved.window ? saved : { ...saved, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      s.availability = initial; s.draft = JSON.parse(JSON.stringify(initial)); s.friends = data.friends || [];
      s.now = Date.now();
    } catch (err) { s.error = err.message; s.failed = true; }
    s.loading = false; paint();
  }
  async function loadGames() {
    try {
      const raw = await window.playbound.getCatalog();
      const list = Array.isArray(raw) ? raw : raw?.games || [];
      s.games = list.filter(catalogGameSupportsParty).sort((a, b) => String(a.title).localeCompare(String(b.title)));
      paint();
    } catch { /* the game picker just stays empty */ }
  }
  async function save(next) {
    if (s.busy) return;
    s.busy = true; s.error = ''; s.notice = ''; paint();
    try {
      const res = await window.playbound.savePlayAvailability?.(next);
      if (!res || res.error) throw new Error(res?.error || 'Could not save availability');
      s.availability = res.availability; s.draft = JSON.parse(JSON.stringify(res.availability));
      s.notice = res.availability.publishLooking ? 'Saved. You’ll appear in Looking to Party during your play windows.' : 'Availability saved. Only your friends can see it.';
      s.now = Date.now();
    } catch (err) { s.error = err.message || 'Could not save availability'; }
    s.busy = false; paint();
  }
  function preset(tonight) {
    const starts = new Date();
    if (tonight) { starts.setHours(19, 0, 0, 0); if (starts.getTime() < Date.now()) starts.setTime(Date.now()); }
    const ends = new Date(starts.getTime() + 2 * 3600000);
    return save({ ...s.availability, window: { startsAt: starts.toISOString(), endsAt: ends.toISOString() } });
  }
  const fmt = (time) => new Date(time).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.availability.timezone });
  const chosen = () => s.friends.filter((f) => s.selected.has(f.id));
  const overlap = () => (s.selected.size ? commonAvailability([s.availability, ...chosen().map((f) => f.availability)], s.now, s.duration) : []);
  function freeToday() {
    const endOfDay = new Date(s.now); endOfDay.setHours(24, 0, 0, 0);
    return s.friends.flatMap((friend) => {
      for (let t = s.now; t < endOfDay.getTime(); t += 15 * 60000) if (availableAt(friend.availability, t)) return [{ ...friend, freeAt: t }];
      return [];
    });
  }
  async function createEvent() {
    if (s.busy) return;
    const time = Date.parse(s.eventTime);
    const slots = overlap();
    if (!chosen().length || !s.game || !Number.isFinite(time) || time <= s.now || !slots.some((slot) => time >= Date.parse(slot.startsAt) && time + s.duration * 60000 <= Date.parse(slot.endsAt))) {
      s.error = 'Choose a game and a future time that fits everyone’s availability.'; paint(); return;
    }
    s.busy = true; s.error = ''; paint();
    const game = s.games.find((g) => g.slug === s.game);
    try {
      const res = await window.playbound.createEvent({
        title: s.title.trim() || `${game?.title || 'Game'} with friends`, gameSlug: s.game, eventType: 'game_night', hostType: 'community',
        visibility: 'unlisted', startsAt: new Date(time).toISOString(), endsAt: new Date(time + s.duration * 60000).toISOString(), timezone: s.availability.timezone,
      });
      if (!res?.ok) throw new Error(res?.error || 'Could not create event');
      s.notice = 'Game Night created. Share its link with your friends so they can RSVP.';
      s.eventTime = ''; s.title = '';
      if (res.event?.id) window.playbound.openExternal?.(`https://playbound.club/events/${res.event.id}`);
    } catch (err) { s.error = err.message || 'Could not create event'; }
    s.busy = false; paint();
  }

  const btn = (id, label, extra = '') => `<button type="button" class="btn-secondary btn-sm" id="${id}" ${s.busy ? 'disabled' : ''} ${extra}>${label}</button>`;

  function paint() {
    if (s.loading) { host.innerHTML = '<section class="site-panel site-pad" aria-busy="true"><p class="view-sub">Loading play availability…</p></section>'; return; }
    if (s.failed) { host.innerHTML = `<section class="site-panel site-pad"><p role="alert" class="view-sub">${escapeHtml(s.error)}</p>${btn('pa-retry', 'Retry availability')}</section>`; host.querySelector('#pa-retry').onclick = load; return; }
    const a = s.availability;
    const slots = overlap();
    const free = freeToday();
    const windowLine = a.window && Date.parse(a.window.endsAt) > s.now ? `<p class="view-sub">Your next window: ${escapeHtml(fmt(a.window.startsAt))} – ${escapeHtml(fmt(a.window.endsAt))}</p>` : '';
    const shared = s.games.filter((g) => chosen().length && chosen().every((f) => (f.sharedGames || []).some((sg) => sg.slug === g.slug)));
    const others = s.games.filter((g) => !shared.some((c) => c.slug === g.slug));
    const opt = (g) => `<option value="${escapeHtml(g.slug)}" ${s.game === g.slug ? 'selected' : ''}>${escapeHtml(g.title)}</option>`;
    host.innerHTML = `<section class="site-panel site-pad play-availability-panel" style="display:grid;gap:14px;">
      <div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px;">
        <div><h2 style="margin:0">Who can play tonight?</h2><p class="view-sub" style="margin:4px 0 0">Share a time with friends, or find a time together.</p></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${btn('pa-refresh', 'Refresh availability')}${btn('pa-edit', s.editOpen ? 'Close availability' : 'Set my availability')}</div>
      </div>
      ${s.error ? `<p role="alert" class="create-party-error" style="display:block">${escapeHtml(s.error)}</p>` : ''}${s.notice ? `<p role="status" class="view-sub">${escapeHtml(s.notice)}</p>` : ''}
      ${windowLine}
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${btn('pa-now', 'Free now · 2 hours')}${btn('pa-tonight', 'Free tonight · 2 hours')}${btn('pa-stop', 'Stop sharing availability')}</div>
      ${s.editOpen ? `<div class="site-panel" style="padding:14px;display:grid;gap:12px;">
        <p class="view-sub" style="margin:0">Your full schedule stays friends-only. One-time windows expire automatically. Your usual week stays saved until you change it. Appear offline and Hide activity also hide availability and automatic Looking to Party listings.</p>
        <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;">
          <label class="create-party-label">From · your device time<input type="datetime-local" class="create-party-input" id="pa-start" value="${escapeHtml(s.start)}"></label>
          <label class="create-party-label">Until<input type="datetime-local" class="create-party-input" id="pa-end" value="${escapeHtml(s.end)}"></label>
          ${btn('pa-save-window', 'Save this window')}
        </div>
        <label class="create-party-label" style="max-width:320px">Weekly timezone<input class="create-party-input" id="pa-tz" value="${escapeHtml(s.draft.timezone)}" placeholder="America/Chicago"></label>
        <h3 style="margin:0">My usual week</h3>
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;"><input type="checkbox" id="pa-looking" ${s.draft.publishLooking ? 'checked' : ''}><span>Show me in Looking to Party during my play windows<br><small class="view-sub">Signed-in players can see your name and installed games while you’re available. Your full schedule stays friends-only. Save below to apply.</small></span></label>
        <p class="view-sub" style="margin:0;font-size:12px">Choose daytime or evening windows. For overnight availability, use a window on each day.</p>
        ${[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const slot = s.draft.weekly.find((x) => x.day === day);
          return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;"><label style="width:120px;display:flex;gap:8px;align-items:center;font-size:13px;"><input type="checkbox" data-day="${day}" ${slot ? 'checked' : ''}>${DAYS[day]}</label>${slot ? `<input type="time" class="create-party-input" style="width:auto" data-start="${day}" value="${minuteText(slot.startMinute)}"> <span>to</span> <input type="time" class="create-party-input" style="width:auto" data-end="${day}" value="${minuteText(slot.endMinute)}">` : ''}</div>`;
        }).join('')}
        ${btn('pa-save-week', 'Save my usual week')}
      </div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${free.map((f) => `<span class="chip chip-accent">${escapeHtml(f.username)} · ${f.freeAt === s.now ? 'free now' : `free at ${new Date(f.freeAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}</span>`).join('')}</div>
      ${free.length ? '' : '<p class="view-sub" style="margin:0">No friends have shared an available time today yet.</p>'}
      <div style="display:grid;gap:12px;border-top:1px solid var(--border);padding-top:14px;">
        <h3 style="margin:0">Find a time together</h3>
        <p class="view-sub" style="margin:0">Select friends to find a shared window in the next seven days. Times below are in ${escapeHtml(a.timezone)}.</p>
        ${s.friends.length ? '' : '<p class="view-sub" style="margin:0">Add friends to start planning together.</p>'}
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${s.friends.map((f) => `<label style="display:flex;gap:8px;align-items:center;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:13px;"><input type="checkbox" data-friend="${escapeHtml(f.id)}" ${s.selected.has(f.id) ? 'checked' : ''}>${escapeHtml(f.username)}${!f.availability.weekly.length && !f.availability.window ? ' <small class="view-sub">hasn’t shared a time</small>' : ''}</label>`).join('')}</div>
        <label class="create-party-label" style="max-width:260px">Session length<select class="create-party-input" id="pa-duration">${[30, 60, 120].map((m) => `<option value="${m}" ${s.duration === m ? 'selected' : ''}>${m === 30 ? '30 minutes' : m === 60 ? '1 hour' : '2 hours'}</option>`).join('')}</select></label>
        ${chosen().length && !slots.length ? '<p class="view-sub" style="margin:0">No shared window yet. Everyone needs to save availability that overlaps.</p>' : ''}
        ${slots.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${slots.slice(0, 10).map((slot) => `<button type="button" class="btn-secondary btn-sm ${s.eventTime === slot.startsAt ? 'active' : ''}" data-slot="${escapeHtml(slot.startsAt)}" aria-pressed="${s.eventTime === slot.startsAt}">${escapeHtml(fmt(slot.startsAt))} – ${escapeHtml(fmt(slot.endsAt))}</button>`).join('')}</div>
          <p class="view-sub" style="margin:0">Choose a window to start at its earliest available time, or pick another time inside it.</p>
          <label class="create-party-label" style="max-width:320px">Start · your device time<input class="create-party-input" type="datetime-local" id="pa-event-time" value="${s.eventTime ? escapeHtml(localInput(new Date(s.eventTime))) : ''}"></label>
          <label class="create-party-label" style="max-width:320px">Game<select class="create-party-input" id="pa-game"><option value="">Choose a multiplayer game</option>${shared.length ? `<optgroup label="Installed for everyone">${shared.map(opt).join('')}</optgroup>` : ''}<optgroup label="Other multiplayer games">${others.map(opt).join('')}</optgroup></select></label>
          <label class="create-party-label" style="max-width:480px">Event name · optional<input class="create-party-input" id="pa-title" maxlength="150" value="${escapeHtml(s.title)}"></label>
          <p class="view-sub" style="margin:0;font-size:12px">Creates an unlisted Game Night. Anyone with its link can view it. Share the link with your friends so they can RSVP; it won’t appear in public event listings.</p>
          <div><button type="button" class="btn-primary" id="pa-create" ${s.busy || !s.eventTime || !s.game ? 'disabled' : ''}>${s.busy ? 'Saving…' : 'Create Game Night'}</button></div>` : ''}
      </div>
    </section>`;
    wire();
  }

  function wire() {
    const $ = (id) => host.querySelector(`#${id}`);
    $('pa-refresh').onclick = load;
    $('pa-edit').onclick = () => { s.editOpen = !s.editOpen; paint(); };
    $('pa-now').onclick = () => preset(false);
    $('pa-tonight').onclick = () => preset(true);
    $('pa-stop').onclick = () => save(emptyAvailability(s.availability.timezone));
    if (s.editOpen) {
      $('pa-start').oninput = (e) => { s.start = e.target.value; };
      $('pa-end').oninput = (e) => { s.end = e.target.value; };
      $('pa-save-window').onclick = () => { if (!s.start || !s.end) return; void save({ ...s.draft, window: { startsAt: new Date(s.start).toISOString(), endsAt: new Date(s.end).toISOString() } }); };
      $('pa-tz').oninput = (e) => { s.draft.timezone = e.target.value; };
      $('pa-looking').onchange = (e) => { s.draft.publishLooking = e.target.checked; };
      host.querySelectorAll('[data-day]').forEach((box) => { box.onchange = () => {
        const day = Number(box.dataset.day);
        s.draft.weekly = box.checked ? [...s.draft.weekly.filter((x) => x.day !== day), { day, startMinute: 19 * 60, endMinute: 22 * 60 }] : s.draft.weekly.filter((x) => x.day !== day);
        paint();
      }; });
      host.querySelectorAll('[data-start]').forEach((input) => { input.onchange = () => { const slot = s.draft.weekly.find((x) => x.day === Number(input.dataset.start)); if (slot) slot.startMinute = parseMinute(input.value); }; });
      host.querySelectorAll('[data-end]').forEach((input) => { input.onchange = () => { const slot = s.draft.weekly.find((x) => x.day === Number(input.dataset.end)); if (slot) slot.endMinute = parseMinute(input.value); }; });
      $('pa-save-week').onclick = () => save(s.draft);
    }
    host.querySelectorAll('[data-friend]').forEach((box) => { box.onchange = () => { if (box.checked) s.selected.add(box.dataset.friend); else s.selected.delete(box.dataset.friend); s.eventTime = ''; paint(); }; });
    $('pa-duration').onchange = (e) => { s.duration = Number(e.target.value); s.eventTime = ''; paint(); };
    host.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { s.eventTime = b.dataset.slot; paint(); }; });
    const et = $('pa-event-time'); if (et) et.onchange = (e) => { s.eventTime = e.target.value ? new Date(e.target.value).toISOString() : ''; paint(); };
    const gs = $('pa-game'); if (gs) gs.onchange = (e) => { s.game = e.target.value; paint(); };
    const tt = $('pa-title'); if (tt) tt.oninput = (e) => { s.title = e.target.value; };
    const create = $('pa-create'); if (create) create.onclick = createEvent;
  }

  // Keep "free now" honest while the Friends page stays open.
  const tick = setInterval(() => { if (!host.isConnected) { clearInterval(tick); return; } s.now = Date.now(); const typing = host.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName); if (!s.loading && !s.editOpen && !s.busy && !typing) paint(); }, 60000);
  void load();
  void loadGames();
}
