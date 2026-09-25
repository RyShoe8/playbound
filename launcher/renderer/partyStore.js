/** Owns party snapshots and rejects reads started before a local change. */
export function createPartyStore() {
  let parties = [];
  let revision = 0;
  let reads = 0;
  let acceptedRead = 0;
  let emptyCount = 0;
  let accountId = null;
  const pending = new Set();
  const snapshot = () => structuredClone(parties);
  function replace(next) {
    parties = structuredClone(next);
    emptyCount = 0;
  }
  return {
    get current() { return snapshot()[0] || null; },
    get pending() { return pending.size > 0; },
    setAccount(id) {
      if (id === accountId) return;
      accountId = id;
      ++revision;
      pending.clear();
      replace([]);
    },
    beginRead() { return { revision, sequence: ++reads }; },
    acceptRead(data, token, { keepDuringInstall = false } = {}) {
      if (!data || data.error) return data;
      if (!token || token.revision !== revision || token.sequence <= acceptedRead || pending.size) {
        return { ...data, myParties: snapshot() };
      }
      acceptedRead = token.sequence;
      // Missing lists and partial failures are unknown, never confirmed empty.
      if (data.errors?.includes("parties") || !Array.isArray(data.myParties)) {
        return { ...data, myParties: snapshot() };
      }
      if (data.myParties.length) replace(data.myParties);
      else if (!keepDuringInstall && ++emptyCount >= 5) replace([]);
      return { ...data, myParties: snapshot() };
    },
    set(party) { ++revision; replace(party ? [party] : []); },
    clear() { ++revision; replace([]); },
    beginAction(next) {
      const token = { revision: ++revision, before: snapshot() };
      pending.add(token);
      if (next) replace([next]);
      return token;
    },
    finishAction(token, { party, failed = false } = {}) {
      if (!pending.delete(token) || token.revision !== revision) return false;
      ++revision;
      if (failed) replace(token.before);
      else if (party) replace([party]);
      return true;
    },
  };
}

export const partyStore = createPartyStore();
