"use client";

import { usePresenceStore } from "@/stores/presenceStore";
import {
  HEARTBEAT_INTERVAL_MS,
  type ClientReportableStatus,
  type HeartbeatPayload,
} from "@/lib/presence/types";

/**
 * The presence controller.
 *
 * A module-level singleton rather than React state on purpose: the spec's
 * "avoid duplicate sessions if multiple components mount" cannot be satisfied
 * by a hook, because two mounted hooks each get their own state and would each
 * open a session and each start a timer. Module scope is the only thing shared
 * across every mount in a tab, so the guard lives here and the React layer is
 * a thin wrapper that just calls in.
 */

type Timer = ReturnType<typeof setInterval>;

interface ControllerState {
  running: boolean;
  starting: boolean;
  timer: Timer | null;
  retry: ReturnType<typeof setTimeout> | null;
  /** Coalesces rapid soft-nav route reports so they don't contend with RSC. */
  routeDebounce: ReturnType<typeof setTimeout> | null;
  sessionId: string | null;
  /** Last payload sent, so unchanged fields can be omitted. */
  last: { status?: string; page?: string | null; gameId?: string | null; editionId?: string | null };
}

const state: ControllerState = {
  running: false,
  starting: false,
  timer: null,
  retry: null,
  routeDebounce: null,
  sessionId: null,
  last: {},
};

/** Wait for the RSC flight to settle before POSTing presence on route change. */
const ROUTE_REPORT_DEBOUNCE_MS = 750;

/** Consecutive-failure backoff, capped. Never gives up entirely. */
const RETRY_SCHEDULE_MS = [5_000, 15_000, 30_000, 60_000];

function retryDelay(failures: number): number {
  return RETRY_SCHEDULE_MS[Math.min(failures, RETRY_SCHEDULE_MS.length - 1)];
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`/api/presence/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * Derive what the user is doing from the route.
 *
 * Free presence detail with no per-page wiring: any page that already exists
 * reports something sensible, and a new page defaults to "browsing" rather
 * than reporting nothing.
 */
export function describeRoute(pathname: string): {
  status: ClientReportableStatus;
  gameId: string | null;
  editionId: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "games" && parts[1]) {
    const gameId = decodeURIComponent(parts[1]);
    const editionId = parts[2] === "editions" && parts[3] ? decodeURIComponent(parts[3]) : null;
    return { status: "viewing_game", gameId, editionId };
  }
  return { status: "browsing", gameId: null, editionId: null };
}

function clearTimers() {
  if (state.timer) clearInterval(state.timer);
  if (state.retry) clearTimeout(state.retry);
  if (state.routeDebounce) clearTimeout(state.routeDebounce);
  state.timer = null;
  state.retry = null;
  state.routeDebounce = null;
}

/** Only send what changed — this fires every minute for every open tab. */
function buildPayload(next: HeartbeatPayload, force = false): HeartbeatPayload {
  const body: HeartbeatPayload = { sessionId: state.sessionId };
  if (force || next.status !== state.last.status) body.status = next.status;
  if (force || next.page !== state.last.page) body.page = next.page;
  if (force || next.gameId !== state.last.gameId) body.gameId = next.gameId;
  if (force || next.editionId !== state.last.editionId) body.editionId = next.editionId;
  return body;
}

function remember(next: HeartbeatPayload) {
  state.last = {
    status: next.status,
    page: next.page,
    gameId: next.gameId,
    editionId: next.editionId,
  };
}

function currentPayload(): HeartbeatPayload {
  const store = usePresenceStore.getState();
  return {
    status: store.status === "offline" ? "online" : store.status,
    page: store.currentPage,
    gameId: store.currentGame,
    editionId: store.currentEdition,
  };
}

async function sendHeartbeat(force = false) {
  if (!state.running || !state.sessionId) return;
  const store = usePresenceStore.getState();
  const next = currentPayload();

  try {
    const res = await post("heartbeat", buildPayload(next, force));

    if (res.status === 401) {
      // Signed out or session expired — stop rather than retry forever.
      stopPresence({ notifyServer: false });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    remember(next);
    usePresenceStore.getState().recordHeartbeat(new Date().toISOString());
  } catch (err) {
    // A failed beat is usually transient. The session is left intact and a
    // retry is scheduled; the server-side sweep is what eventually closes a
    // client that never comes back, so nothing leaks if this keeps failing.
    store.recordFailure(err instanceof Error ? err.message : "heartbeat failed");
    scheduleRetry();
  }
}

function scheduleRetry() {
  if (!state.running) return;
  if (state.retry) clearTimeout(state.retry);
  const failures = usePresenceStore.getState().failures;
  state.retry = setTimeout(() => {
    state.retry = null;
    // Force a full payload: after a failure the server's view may have
    // diverged from what we think it last received.
    void sendHeartbeat(true);
  }, retryDelay(failures));
}

/**
 * Begin presence for the signed-in user.
 *
 * Guarded so repeated calls — a remount, a route change, a second provider —
 * cannot open a second session or a second timer.
 */
export async function startPresence(initial: HeartbeatPayload) {
  if (state.running || state.starting) return;
  state.starting = true;

  const store = usePresenceStore.getState();
  store.setLoading(true);

  try {
    const res = await post("start", { ...initial, sessionId: state.sessionId });
    if (res.status === 401) {
      store.setLoading(false);
      state.starting = false;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      sessionId: string;
      platform: "web" | "launcher" | "mobile" | "tv";
      device: "desktop" | "tablet" | "mobile" | "launcher";
      os?: string;
      heartbeatIntervalMs?: number;
    };

    state.sessionId = data.sessionId;
    state.running = true;
    remember(initial);
    usePresenceStore.getState().setStarted({
      sessionId: data.sessionId,
      platform: data.platform,
      device: data.device,
    });

    clearTimers();
    // Cadence comes from the server so it can be changed without a client
    // release.
    const interval = data.heartbeatIntervalMs || HEARTBEAT_INTERVAL_MS;
    state.timer = setInterval(() => void sendHeartbeat(), interval);
  } catch (err) {
    store.recordFailure(err instanceof Error ? err.message : "start failed");
    store.setLoading(false);
    // Retry the start itself — a user who loads the page offline should still
    // register presence once the network returns.
    state.retry = setTimeout(() => {
      state.retry = null;
      state.starting = false;
      void startPresence(initial);
    }, retryDelay(usePresenceStore.getState().failures));
    return;
  } finally {
    state.starting = false;
  }
}

/**
 * Push a route change. Updates local store immediately; the network heartbeat
 * is debounced so rapid soft navigations don't compete with the RSC response.
 *
 * Skips the request when nothing actually changed. PresenceProvider already
 * dedupes by path, but relying on the caller to do that would mean any future
 * call site could quietly double the heartbeat traffic.
 */
export function reportRoute(page: string) {
  const { status, gameId, editionId } = describeRoute(page);
  const store = usePresenceStore.getState();
  const nextStatus = store.status === "away" ? store.status : status;

  const unchanged =
    state.last.page === page &&
    state.last.gameId === gameId &&
    state.last.editionId === editionId &&
    state.last.status === nextStatus;

  store.setRoute(page, gameId, editionId);
  if (store.status !== "away") store.setStatus(status);

  if (unchanged) return;
  if (!state.running) return;

  if (state.routeDebounce) clearTimeout(state.routeDebounce);
  state.routeDebounce = setTimeout(() => {
    state.routeDebounce = null;
    if (state.running) void sendHeartbeat();
  }, ROUTE_REPORT_DEBOUNCE_MS);
}

/** Tab hidden/visible. Away rather than offline — the user has not left. */
export function reportVisibility(hidden: boolean) {
  const store = usePresenceStore.getState();
  if (hidden) {
    store.setStatus("away");
  } else {
    const { status } = describeRoute(store.currentPage || "/");
    store.setStatus(status);
  }
  if (state.running) void sendHeartbeat();
}

/**
 * End presence.
 *
 * `sendBeacon` is used for page unload because a normal fetch is cancelled
 * when the document goes away. It is best effort either way — the sweep is the
 * real guarantee.
 */
export function stopPresence(opts: { notifyServer?: boolean; beacon?: boolean } = {}) {
  const { notifyServer = true, beacon = false } = opts;
  const sessionId = state.sessionId;

  clearTimers();
  state.running = false;
  state.starting = false;
  state.sessionId = null;
  state.last = {};
  usePresenceStore.getState().reset();

  if (!notifyServer || !sessionId) return;

  const body = JSON.stringify({ sessionId });
  if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/presence/end", new Blob([body], { type: "application/json" }));
    return;
  }
  void post("end", { sessionId }).catch(() => undefined);
}

/** Test/debug hook — not used by the app. */
export function __presenceInternals() {
  return state;
}
