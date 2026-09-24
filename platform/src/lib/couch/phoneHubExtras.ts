import { mapPhoneHubPad, type HubPadState } from "@/lib/couch/phoneHubPads";

type Identity = {
  controllerId: string;
  controllerToken: string;
  sessionToken: string | null;
  sessionId: string;
  playerSlot: number | null;
  status: string;
};

export type HubExtraRow = {
  index: number;
  label: string;
  playerSlot: number | null;
  status: string;
  connected: boolean;
};

type TrackedPad = HubExtraRow & {
  identity: Identity | null;
  joining: boolean;
  polling: boolean;
  retryAt: number;
  pollAt: number;
  sequence: number;
  lastKey: string;
  lastSent: number;
};

const NEUTRAL: HubPadState = { buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
const stateKey = (s: HubPadState) => [s.buttons, s.lx, s.ly, s.rx, s.ry, s.lt, s.rt]
  .map((v) => Math.round(v * 1000)).join("|");

/** Additional pads share the first phone's transport, but each owns a server-issued identity and slot. */
export function createPhoneHubExtras({
  code, sessionId, send, onChange,
}: {
  code: string;
  sessionId: string;
  send: (packet: object) => void;
  onChange: (rows: HubExtraRow[]) => void;
}) {
  const rows = new Map<number, TrackedPad>();
  let joinQueue = Promise.resolve();
  let disposed = false;

  const storageKey = (index: number) => `playbound.couch.hub.${code}.${index}`;
  const stored = (index: number): Partial<Identity> | null => {
    try {
      const raw = sessionStorage.getItem(storageKey(index));
      const identity = raw ? JSON.parse(raw) as Partial<Identity> : null;
      return identity?.sessionId === sessionId ? identity : null;
    } catch { return null; }
  };
  const persist = (index: number, identity: Identity) => {
    try { sessionStorage.setItem(storageKey(index), JSON.stringify(identity)); } catch { /* optional */ }
  };
  const forget = (index: number) => {
    try { sessionStorage.removeItem(storageKey(index)); } catch { /* optional */ }
  };
  const publish = () => {
    if (disposed) return;
    onChange([...rows.values()].map(({ index, label, playerSlot, status, connected }) =>
      ({ index, label, playerSlot, status, connected })).sort((a, b) => a.index - b.index));
  };
  const emit = (row: TrackedPad, state: HubPadState, now: number) => {
    const identity = row.identity;
    if (!identity || identity.status !== "approved" || identity.playerSlot == null || !identity.sessionToken) return;
    row.sequence++;
    send({
      v: 1, seq: row.sequence, t: now, p: identity.playerSlot,
      controllerId: identity.controllerId, sessionToken: identity.sessionToken,
      ...state,
    });
    row.lastKey = stateKey(state);
    row.lastSent = now;
  };

  async function joinPad(row: TrackedPad) {
    if (disposed || !row.connected || row.identity) { row.joining = false; return; }
    try {
      const prior = stored(row.index);
      const response = await fetch(`/api/couch/sessions/${encodeURIComponent(code)}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: `Phone hub controller ${row.index + 1}`,
          deviceLabel: row.label, profile: "standard-gamepad",
          controllerId: prior?.controllerId, controllerToken: prior?.controllerToken,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not connect controller");
      if (disposed) return;
      row.identity = {
        controllerId: data.controllerId, controllerToken: data.controllerToken,
        sessionToken: data.sessionToken, sessionId: data.sessionId,
        playerSlot: data.playerSlot, status: data.status,
      };
      row.playerSlot = data.playerSlot;
      row.status = data.status;
      row.pollAt = 0;
      persist(row.index, row.identity);
      publish();
    } catch (err) {
      if (!disposed) {
        row.status = err instanceof Error ? err.message : "Could not connect";
        row.retryAt = performance.now() + 5000;
        publish();
      }
    } finally { row.joining = false; }
  }

  async function pollPad(row: TrackedPad) {
    const identity = row.identity;
    if (!identity || disposed) { row.polling = false; return; }
    try {
      const qs = new URLSearchParams({ controllerId: identity.controllerId, controllerToken: identity.controllerToken });
      const response = await fetch(`/api/couch/sessions/${encodeURIComponent(sessionId)}/join?${qs}`);
      if (response.status === 401) {
        forget(row.index);
        row.identity = null;
        row.playerSlot = null;
        row.status = "reconnecting";
        publish();
        return;
      }
      const data = await response.json();
      if (!response.ok || disposed || row.identity !== identity) return;
      identity.status = data.status;
      identity.playerSlot = data.playerSlot;
      identity.sessionToken = data.sessionToken;
      row.playerSlot = data.playerSlot;
      row.status = data.status;
      persist(row.index, identity);
      publish();
    } catch { /* next poll will retry */ }
    finally { row.polling = false; }
  }

  return {
    observe(pads: Gamepad[], now = performance.now()) {
      if (disposed) return;
      const seen = new Set<number>();
      for (const pad of pads) {
        seen.add(pad.index);
        let row = rows.get(pad.index);
        if (!row) {
          row = {
            index: pad.index, label: pad.id || `Gamepad ${pad.index + 1}`,
            playerSlot: null, status: "connecting", connected: true,
            identity: null, joining: false, polling: false, retryAt: 0,
            pollAt: 0, sequence: 0, lastKey: "", lastSent: 0,
          };
          rows.set(pad.index, row);
          publish();
        } else if (!row.connected) {
          row.connected = true;
          publish();
        }
        if (!row.identity && !row.joining && now >= row.retryAt) {
          row.joining = true;
          joinQueue = joinQueue.then(() => joinPad(row!)).catch(() => {});
        }
        if (row.identity && !row.polling && now >= row.pollAt) {
          row.polling = true;
          row.pollAt = now + 8000;
          void pollPad(row);
        }
        const state = mapPhoneHubPad(pad);
        if (stateKey(state) !== row.lastKey || now - row.lastSent >= 250) emit(row, state, now);
      }
      for (const row of rows.values()) {
        if (!row.connected || seen.has(row.index)) continue;
        emit(row, NEUTRAL, now);
        row.connected = false;
        publish();
      }
    },
    dispose() {
      if (disposed) return;
      for (const row of rows.values()) if (row.connected) emit(row, NEUTRAL, performance.now());
      disposed = true;
    },
  };
}
