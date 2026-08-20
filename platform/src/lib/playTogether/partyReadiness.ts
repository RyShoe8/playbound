/**
 * One answer to "can this party play yet", computed server-side.
 *
 * Two different things were both called `allReady`: `partyRules` means every
 * member pressed Ready Up, `ConfigSyncResult` means every member has the files.
 * The web and launcher panels each rendered one of them next to the other, so a
 * member list reading "Not ready" could sit directly under a green banner
 * saying "Everyone is ready to play". Both were true; the words collided.
 *
 * Resolving it here rather than in each client is also what keeps the two
 * surfaces identical. The launcher is plain JS in a separate package and cannot
 * import this file, so any rule left client-side gets hand-ported and drifts —
 * which is exactly what happened to the config-sync panel. The clients render
 * this; they do not recompute it.
 */

export type PartyReadinessPhase =
  /** Nothing picked yet — there is no question to answer. */
  | "no_game"
  /** Somebody is missing the game, an edition, or mods. */
  | "installing"
  /** Everyone has the files; still waiting on Ready Up. */
  | "waiting_ready"
  /** Everyone has the files and has readied. */
  | "ready"
  /** Already in a session. */
  | "playing";

export interface ReadinessMember {
  userId: string;
  ready?: boolean;
}

export interface ReadinessSync {
  /** Every member has the game, the edition and the mods. */
  allInSync: boolean;
  members: Array<{ userId: string; hasGame: boolean; hasEdition: boolean; missingMods: string[] }>;
}

export interface PartyReadiness {
  phase: PartyReadinessPhase;
  /** Files present for everyone. */
  allInSync: boolean;
  /** Everyone pressed Ready Up. Distinct from `allInSync`, deliberately. */
  allReadyUp: boolean;
  readyCount: number;
  memberCount: number;
  /** Members still missing files, by id. */
  blockedUserIds: string[];
  /** Members who have the files but have not readied, by id. */
  waitingUserIds: string[];
  /**
   * One line describing the party's state, authored once so both clients say
   * the same thing rather than two hand-written approximations of it.
   */
  headline: string;
  detail: string;
}

export function computePartyReadiness(input: {
  gameSlug?: string | null;
  status?: string | null;
  members: ReadinessMember[];
  sync?: ReadinessSync | null;
}): PartyReadiness {
  const members = input.members ?? [];
  const memberCount = members.length;
  const readyCount = members.filter((m) => m.ready).length;
  const allReadyUp = memberCount > 0 && readyCount === memberCount;

  const base = {
    allReadyUp,
    readyCount,
    memberCount,
    blockedUserIds: [] as string[],
    waitingUserIds: [] as string[],
  };

  if (!input.gameSlug) {
    return {
      ...base,
      phase: "no_game",
      allInSync: false,
      headline: "Pick a game",
      detail: "Choose what the party is playing to see who already has it.",
    };
  }

  if (input.status === "playing" || input.status === "launching") {
    return {
      ...base,
      phase: "playing",
      allInSync: input.sync?.allInSync ?? true,
      headline: "Session in progress",
      detail: "Join any time — you do not have to wait for anyone else.",
    };
  }

  /*
   * No sync payload yet. Treated as not-blocked rather than blocked: the panel
   * appears before the first config-sync lands, and defaulting to "someone is
   * missing files" would flash a red warning at a party that is fine.
   */
  const sync = input.sync ?? null;
  const blocked = (sync?.members ?? [])
    .filter((m) => !m.hasGame || !m.hasEdition || m.missingMods.length > 0)
    .map((m) => m.userId);
  const allInSync = sync ? sync.allInSync && blocked.length === 0 : true;

  if (!allInSync) {
    return {
      ...base,
      phase: "installing",
      allInSync: false,
      blockedUserIds: blocked,
      headline:
        blocked.length === 1 ? "One member needs to install" : `${blocked.length} members need to install`,
      detail: "Everyone needs the same version before the party can launch together.",
    };
  }

  const waiting = members.filter((m) => !m.ready).map((m) => m.userId);

  if (!allReadyUp) {
    return {
      ...base,
      phase: "waiting_ready",
      allInSync: true,
      waitingUserIds: waiting,
      headline: "Everyone has the right version",
      /*
       * Says what is outstanding without implying anyone is blocked — a member
       * who has readied can launch now regardless of the others.
       */
      detail:
        waiting.length === 1
          ? "Waiting on 1 player to ready up. You can join the game as soon as you are ready."
          : `Waiting on ${waiting.length} players to ready up. You can join the game as soon as you are ready.`,
    };
  }

  return {
    ...base,
    phase: "ready",
    allInSync: true,
    headline: "Everyone is ready",
    detail: "Same version, everyone readied up. Hit Join Game.",
  };
}
