import { partyStore } from './partyStore.js';

/** Shared game-page/card action. Treat the creation response as authoritative,
 * so a slower friends poll cannot make the newly-created party disappear. */
export function bindGamePartyButton(button, { gameSlug, title, bridge, navigate, report,
  refresh, store = partyStore } = {}) {
  if (!button) return;
  let busy = false;
  const label = () => store.current?.id && store.current.status !== 'ended' ? 'View Party' : 'Create Party';
  button.textContent = label();
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (busy) return;
    const current = store.current;
    if (current?.id && current.status !== 'ended') {
      navigate('friends');
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Creating…';
    button.title = '';
    report?.('Creating party…');
    const action = store.beginAction();
    try {
      if (typeof bridge?.createParty !== 'function') throw new Error('Party creation is unavailable. Restart or update PlayBound.');
      const result = await bridge.createParty({ gameSlug, visibility: 'friends', maxSize: 8 });
      if (result?.error || !result?.party?.id) throw new Error(result?.error || "Couldn't create party. Please try again.");
      if (!store.finishAction(action, { party: result.party })) {
        throw new Error('Your account or party changed. Open Friends to view your current party.');
      }
      navigate('friends');
      report?.(`Party created for ${title || gameSlug}.`);
      // Opening the party never waits on Discord or another network refresh.
      Promise.resolve().then(() => refresh?.()).catch(() => {});
      button.textContent = 'View Party';
    } catch (error) {
      store.finishAction(action, { failed: true });
      const message = error?.message || String(error);
      button.title = message;
      button.textContent = 'Try Again';
      report?.(message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });
}
