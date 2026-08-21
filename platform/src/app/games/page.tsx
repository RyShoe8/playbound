import { permanentRedirect } from "next/navigation";

/**
 * Permanent, not temporary.
 *
 * `redirect()` issues a 307, which tells a crawler the move might be undone —
 * so it keeps the old URL, re-checks it indefinitely, and passes on less. The
 * catalog has lived at /discover for good; a 308 says so and transfers the
 * signal that accumulated here.
 */
export default function GamesIndex() {
  permanentRedirect("/discover");
}
