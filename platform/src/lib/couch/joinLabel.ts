/**
 * Human-readable controller row labels for Couch join + Admin streaming.
 */

export type CouchJoinLabelInput = {
  mode: "keyboard-mouse" | "touch-gamepad" | "standard-gamepad" | string;
  gameLayout: boolean;
  controlChoice: "undecided" | "pc" | "phone";
  /** navigator.getGamepads()[n].id when a pad is connected */
  gamepadId?: string | null;
};

function shortenGamepadId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "Gamepad";
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

/** Pick the label stored on the session controller row. */
export function couchControllerJoinLabel(input: CouchJoinLabelInput): string {
  const { mode, gameLayout, controlChoice, gamepadId } = input;

  if (gameLayout && controlChoice === "phone") return "Phone controller";
  if (mode === "touch-gamepad" && !gameLayout) return "Touch pad";

  if (gamepadId) return shortenGamepadId(gamepadId);

  if (mode === "standard-gamepad") return "Gamepad";
  if (gameLayout && controlChoice === "pc") return "PC controls";
  if (mode === "keyboard-mouse") return "Keyboard & mouse";

  return "Controller";
}
