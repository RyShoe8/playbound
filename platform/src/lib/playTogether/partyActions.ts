/**
 * The party card's action bar, decided server-side.
 *
 * The launcher panel and the web panel are two hand-written renderings of the
 * same screen, and they had drifted: the launcher had grown couch mode, a
 * virtual-LAN exception to "waiting for host", an armed join you can call off,
 * and a "Server Starting…" state, none of which the web had. Even the copy had
 * split — one said "Start Game and your party gets a controller link", the
 * other "Start the game and…".
 *
 * This is the same treatment `partyReadiness` already gives "can this party
 * play yet", for the same reason: the launcher is plain JS in a separate
 * package and cannot import this file, so any rule left client-side gets
 * hand-ported and drifts. The clients render this; they do not recompute it.
 *
 * Icons and tones are named, not styled. An Electron renderer with inline SVG
 * and a React app with lucide components cannot share a widget, but they can
 * share the decision about which icon and which colour role belongs on a
 * button — which is the part that was actually diverging.
 */

/** Colour role. Each client maps these onto its own palette. */
export type PartyActionTone = "primary" | "secondary" | "success" | "danger" | "muted";

/** Icon slot. Each client maps these onto its own icon set. */
export type PartyActionIcon =
  | "play"
  | "loader"
  | "check"
  | "x"
  | "phone"
  | "logout"
  | "crown"
  | "users"
  | "download";

export interface PartyActionButton {
  visible: boolean;
  label: string;
  enabled: boolean;
  /** Why it is disabled, or what it will do. Empty when there is nothing to add. */
  title: string;
  icon: PartyActionIcon | null;
  tone: PartyActionTone;
}

export interface PartyActionNote {
  tone: "info" | "error";
  text: string;
}

export interface PartyCouchPanel {
  /** The badge under the game: this title has no online play. */
  badge: string;
  /** Whose machine runs it, phrased for the viewer. */
  where: string;
  status: "none" | "pending" | "ready" | "failed";
  joinCode: string | null;
  joinUrl: string | null;
  /** What happens next, or what went wrong. */
  note: string;
}

export interface PartyActions {
  ready: PartyActionButton;
  join: PartyActionButton;
  couch: PartyCouchPanel | null;
  /** Inline notes under the action bar, in display order. */
  notes: PartyActionNote[];
  /** Show the "Playing" pill instead of a join button. */
  playingPill: boolean;
  /** Member-row status words, so the two lists cannot disagree. */
  memberReadyLabel: string;
  memberNotReadyLabel: string;
}

export interface PartyActionsInput {
  viewerId: string;
  leaderId: string;
  leaderUsername?: string | null;
  status?: string | null;
  gameSlug?: string | null;
  hostMode?: string | null;
  selfHostReady?: boolean;
  members: Array<{ userId: string; ready?: boolean }>;
  hosted?: { enabled?: boolean; status?: string | null; error?: string | null } | null;
  lan?: {
    enabled?: boolean;
    status?: string | null;
    error?: string | null;
    configured?: boolean;
  } | null;
  couch?: {
    enabled?: boolean;
    status?: string | null;
    joinCode?: string | null;
    joinUrl?: string | null;
    error?: string | null;
  } | null;
  /**
   * The viewer has armed a join and is waiting for the server. Client-side
   * state — only the launcher has it today — but the labels for it belong here
   * with the rest, so the web says the same thing when it grows the feature.
   */
  joinArmed?: boolean;
}

/** Every string the party action bar can show. One place, so both clients agree. */
export const PARTY_COPY = {
  readyUp: "Ready Up",
  cancelReady: "Cancel Ready",
  pickGameFirst: "Pick a game first",
  startGame: "Start Game",
  joinGame: "Join Game",
  waitingForHost: "Waiting for host",
  serverStarting: "Server Starting…",
  joinArmed: "Joining when the server is ready…",
  joinArmedTitle: "PlayBound will join you as soon as the server is up — click to stop waiting",
  hostMustStart: "The party host must start the game first",
  serverStillStarting: "The game server is still starting",
  serverPending: "Server is starting — click to join when ready",
  connectFailed: "Could not start the party connection",
  hostedFailed: "Could not start the PlayBound server.",
  hostedPending: "Starting PlayBound server…",
  hostedPickServer: "Now pick a server under Public server above.",
  lanPending: "Setting up the party network…",
  lanFailed:
    "Could not set up the party network. The discovery reflector may not be running on the NetBird VPS.",
  couchBadge: "Couch co-op · no online play",
  couchLeaderNext: "Start Game and your party gets a controller link.",
  couchMemberNext: "When the host starts the game you will get a link to open on your phone.",
  couchFailed: "Could not start phone controllers on the host's PC.",
  memberReady: "Ready",
  memberNotReady: "Not ready",
  playing: "Playing",
} as const;

const button = (over: Partial<PartyActionButton>): PartyActionButton => ({
  visible: true,
  label: "",
  enabled: true,
  title: "",
  icon: null,
  tone: "primary",
  ...over,
});

export function computePartyActions(input: PartyActionsInput): PartyActions {
  const isLeader = String(input.leaderId) === String(input.viewerId);
  const me = input.members.find((m) => String(m.userId) === String(input.viewerId));
  const isReady = Boolean(me?.ready);
  const hasGame = Boolean(input.gameSlug);
  const ended = input.status === "ended";
  const inFlight = input.status === "launching" || input.status === "playing";

  const hosted = input.hosted ?? {};
  const lan = input.lan ?? {};
  const couch = input.couch ?? {};
  const couchOn = Boolean(couch.enabled);

  const isPeerOrLan = !hosted.enabled || Boolean(lan.enabled);
  /*
   * A virtual-LAN party has no listen server to probe, so selfHostReady is a
   * flag nothing ever sets — HoloCure sat on "Waiting for host" forever. Once
   * the party is in flight everyone is on the segment and the game does its
   * own finding.
   */
  const waitingForLeader =
    !isLeader &&
    !couchOn &&
    isPeerOrLan &&
    (input.hostMode !== "self" || lan.enabled ? !inFlight : !input.selfHostReady);

  const memberWaitingForConnect =
    !isLeader &&
    !couchOn &&
    ((input.hostMode === "self" && !lan.enabled && !input.selfHostReady) ||
      (Boolean(hosted.enabled) && hosted.status !== "ready") ||
      (Boolean(lan.enabled) && lan.configured !== false && lan.status !== "ready"));

  const joinConnectFailed =
    !inFlight &&
    ((Boolean(hosted.enabled) && hosted.status === "failed") ||
      (Boolean(lan.enabled) && lan.status === "failed"));

  /*
   * Couch games have one running copy and it is the leader's. Members join by
   * opening the controller link on a phone, so they get no join button at all
   * rather than a disabled one.
   */
  const canJoin = hasGame && !ended && (isReady || inFlight) && (!couchOn || isLeader);
  const waitingForServer = !isLeader && memberWaitingForConnect && !waitingForLeader;

  const label = input.joinArmed
    ? PARTY_COPY.joinArmed
    : isLeader && !inFlight
      ? PARTY_COPY.startGame
      : waitingForLeader
        ? PARTY_COPY.waitingForHost
        : waitingForServer
          ? PARTY_COPY.serverStarting
          : PARTY_COPY.joinGame;

  /*
   * Failure is checked before "still starting", which is the opposite of the
   * order the launcher had. A failed room also satisfies memberWaitingForConnect
   * (its status is not "ready"), so the launcher told the player the server was
   * still starting when it had already given up — burying the one line that
   * said what went wrong. Both clients render this, so the order is fixed once.
   */
  const connectError =
    hosted.status === "failed" || lan.status === "failed"
      ? hosted.error || lan.error || PARTY_COPY.connectFailed
      : "";
  const title = input.joinArmed
    ? PARTY_COPY.joinArmedTitle
    : waitingForLeader
      ? PARTY_COPY.hostMustStart
      : connectError
        ? connectError
        : waitingForServer
          ? PARTY_COPY.serverStillStarting
          : hosted.status === "pending" || lan.status === "pending"
            ? PARTY_COPY.serverPending
            : "";

  const notes: PartyActionNote[] = [];
  if (input.hostMode === "public" && hosted.enabled && hosted.status !== "ready") {
    notes.push({ tone: "info", text: PARTY_COPY.hostedPickServer });
  } else if (hosted.enabled && hosted.status === "pending") {
    notes.push({ tone: "info", text: PARTY_COPY.hostedPending });
  } else if (hosted.enabled && hosted.status === "failed") {
    notes.push({ tone: "error", text: hosted.error || PARTY_COPY.hostedFailed });
  }
  if (lan.enabled && lan.status === "pending") {
    notes.push({ tone: "info", text: PARTY_COPY.lanPending });
  } else if (lan.enabled && lan.status === "failed") {
    notes.push({ tone: "error", text: lan.error || PARTY_COPY.lanFailed });
  }

  return {
    ready: button({
      visible: !ended && !inFlight,
      label: isReady ? PARTY_COPY.cancelReady : PARTY_COPY.readyUp,
      enabled: hasGame,
      title: hasGame ? "" : PARTY_COPY.pickGameFirst,
      icon: isReady ? "x" : "check",
      tone: isReady ? "secondary" : "success",
    }),
    join: button({
      visible: canJoin,
      label,
      /*
       * An armed join stays clickable so it can be called off, and everything
       * else that would disable it is already described by the label.
       */
      enabled: input.joinArmed
        ? true
        : !(joinConnectFailed || waitingForLeader || memberWaitingForConnect),
      title,
      icon: waitingForLeader || waitingForServer || input.joinArmed ? "loader" : "play",
      tone: "primary",
    }),
    couch: couchOn
      ? {
          badge: PARTY_COPY.couchBadge,
          where: isLeader
            ? "Runs on your PC. Everyone else plays on it with their phone as a controller."
            : `Runs on ${input.leaderUsername || "the host"}'s PC. Everyone else plays on it with their phone as a controller.`,
          status: (couch.status as PartyCouchPanel["status"]) || "none",
          joinCode: couch.joinCode || null,
          joinUrl:
            couch.joinUrl ||
            (couch.joinCode ? `https://playbound.club/controller/${couch.joinCode}` : null),
          note:
            couch.status === "failed"
              ? couch.error || PARTY_COPY.couchFailed
              : isLeader
                ? PARTY_COPY.couchLeaderNext
                : PARTY_COPY.couchMemberNext,
        }
      : null,
    notes,
    playingPill: input.status === "playing" && !canJoin,
    memberReadyLabel: PARTY_COPY.memberReady,
    memberNotReadyLabel: PARTY_COPY.memberNotReady,
  };
}
