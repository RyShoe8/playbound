/** Opt-in bounded snapshot following. No background polling after navigation,
 * hidden windows, errors or pause; requests never overlap. */
export function createLogFollower({ read, show, error, active, visible,
  schedule = setTimeout, cancel = clearTimeout }) {
  let following = false, generation = 0, timer, pending = false;
  const stop = () => { following = false; generation++; cancel(timer); };
  async function tick() {
    if (!following || !active() || !visible() || pending) return;
    const token = generation;
    pending = true;
    try {
      const snapshot = await read();
      if (following && token === generation && active() && visible()) show(snapshot);
    } catch (failure) {
      if (following && token === generation && active()) { stop(); error(failure); }
    } finally {
      pending = false;
      if (following && active() && visible()) timer = schedule(() => void tick(), 5000);
    }
  }
  return {
    start() { if (following) return; following = true; generation++; void tick(); },
    stop,
    visibilityChanged() { generation++; cancel(timer); if (following && visible()) void tick(); },
    get following() { return following; },
  };
}
