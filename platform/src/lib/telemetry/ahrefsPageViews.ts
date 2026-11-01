import { isTelemetryExcludedPath } from "./types";

/** One explicit page view per committed route; do not queue stale URLs while the SDK loads. */
export function createAhrefsPageViewTracker() {
  let lastPath: string | null = null;
  return (input: {
    pathname: string;
    search: string;
    notFound: boolean;
    send?: () => void;
  }) => {
    if (isTelemetryExcludedPath(input.pathname) || input.notFound) {
      lastPath = null;
      return;
    }
    const path = `${input.pathname}${input.search}`;
    if (!input.send || path === lastPath) return;
    input.send();
    lastPath = path;
  };
}
