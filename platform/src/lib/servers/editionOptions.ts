import { supportsMultiplayer } from "@/lib/multiplayer/support";

export type EditionOption = {
  slug: string;
  name: string;
  virtual?: boolean;
  visibility?: string;
  /** Carried so the dropdown can tell a multiplayer edition from a solo one. */
  features?: string[];
  tags?: string[];
};

/**
 * Editions worth offering in a server browser.
 *
 * Multiplayer editions win outright when any exist, and a single one is enough.
 * The old rule needed two before it showed anything, which is right for a
 * generic "which version do you want" picker and wrong here: an edition that
 * supports multiplayer is exactly what scopes the server list, so hiding the
 * only one meant a game's multiplayer edition was unreachable from the browser
 * that exists to find its servers. Solo editions are dropped alongside it —
 * selecting one could only ever produce an empty list.
 *
 * With no edition declaring multiplayer we cannot tell them apart, so the
 * original behaviour stands rather than emptying the dropdown on a guess.
 *
 * Lives here rather than inside the component so it can be tested directly;
 * a copy in the test would only ever prove the copy right.
 */
export function choosablePublicEditions(list: EditionOption[]): EditionOption[] {
  const publicReal = list.filter(
    (e) => e.visibility !== "hidden" && e.visibility !== "unlisted" && !e.virtual
  );
  // API already filters hidden; keep public + active-ish. Unlisted stay off the dropdown.
  const usable =
    publicReal.length > 0
      ? publicReal
      : list.filter((e) => !e.virtual && e.visibility !== "hidden");

  const multiplayer = usable.filter((e) => supportsMultiplayer(e));
  if (multiplayer.length > 0) return multiplayer;

  return usable.length >= 2 ? usable : [];
}
