import { refreshPartyAndFriends } from "@/stores/partyStore";

/** Immediate party + friends refresh on tab focus / visibility. */
export function watchPartySyncFocus(): () => void {
  let stopped = false;

  const refresh = () => {
    if (stopped || document.visibilityState === "hidden") return;
    void refreshPartyAndFriends();
  };

  const onFocus = () => refresh();
  const onVis = () => {
    if (document.visibilityState === "visible") refresh();
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    stopped = true;
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVis);
  };
}
