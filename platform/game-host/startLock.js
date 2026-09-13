/**
 * Serialize room starts per party and count in-flight reservations against
 * capacity so two concurrent POSTs cannot share a party or over-allocate.
 */
export function createStartCoordinator({ maxRooms, occupiedCount }) {
  const locks = new Map();
  let pendingReservations = 0;

  function withPartyLock(partyId, fn) {
    const prev = locks.get(partyId) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const next = prev.catch(() => {}).then(() => gate);
    locks.set(partyId, next);
    return prev.catch(() => {}).then(async () => {
      try {
        return await fn();
      } finally {
        release();
        if (locks.get(partyId) === next) locks.delete(partyId);
      }
    });
  }

  function reserveCapacity() {
    if (occupiedCount() + pendingReservations >= maxRooms()) {
      return false;
    }
    pendingReservations += 1;
    return true;
  }

  function releaseCapacity() {
    pendingReservations = Math.max(0, pendingReservations - 1);
  }

  return { withPartyLock, reserveCapacity, releaseCapacity };
}
