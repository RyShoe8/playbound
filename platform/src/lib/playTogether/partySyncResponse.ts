/**
 * Build a party-sync JSON body that omits failed sections.
 *
 * Clients keep the last good friends/parties values when a dependency fails.
 * Returning `[]` for a failed read looked identical to "you have no friends"
 * and wiped the panel until the next successful poll.
 */
export function partySyncResponseBody(input: {
  friends?: unknown;
  incoming?: unknown;
  outgoing?: unknown;
  myParties?: unknown;
  discoverable?: unknown | null;
  errors: string[];
}): Record<string, unknown> {
  const failed = new Set(input.errors);
  const body: Record<string, unknown> = {};
  if (!failed.has("friends") && input.friends !== undefined) {
    body.friends = input.friends;
  }
  if (!failed.has("requests")) {
    if (input.incoming !== undefined) body.incoming = input.incoming;
    if (input.outgoing !== undefined) body.outgoing = input.outgoing;
  }
  if (!failed.has("parties") && input.myParties !== undefined) {
    body.myParties = input.myParties;
  }
  if (!failed.has("discoverable") && input.discoverable != null) {
    body.discoverable = input.discoverable;
  }
  if (input.errors.length > 0) body.errors = input.errors;
  return body;
}
