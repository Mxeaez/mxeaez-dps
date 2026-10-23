import localforage from 'localforage';
import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { ImportableData, IMPORT_VERSION } from '@/types/State';
import { NUMBER_OF_LOADOUTS } from '@/lib/constants';

/**
 * Writes a player + boss (with phase, party size and drains in its inputs) into the main calculator's saved session
 * (as a new loadout, or replacing the selected one when all loadouts are used) and opens the calculator, which
 * restores it on load. Used by the "Per boss" and "Search" tabs of /best-setup.
 */
const openInCalculator = async (player: Player, monster: Monster) => {
  let data: ImportableData = {
    serializationVersion: IMPORT_VERSION,
    loadouts: [player],
    selectedLoadout: 0,
    monster,
  };
  try {
    const saved = await localforage.getItem<ImportableData>('dps-calc-state');
    if (saved && saved.serializationVersion === IMPORT_VERSION && saved.loadouts?.length) {
      const loadouts = [...saved.loadouts];
      let ix = loadouts.length;
      if (ix >= NUMBER_OF_LOADOUTS) {
        ix = saved.selectedLoadout || 0;
      }
      loadouts[ix] = player;
      data = { ...data, loadouts, selectedLoadout: ix };
    }
  } catch (e) { /* no saved session: start a fresh one */ }

  await localforage.setItem('dps-calc-state', data);
  window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`);
};

/**
 * Phase 17 ("Load all loadouts" on the Plan tab): appends the players to the calculator's saved loadouts when there is
 * room for all of them, otherwise replaces the saved loadouts with them (at most NUMBER_OF_LOADOUTS), selects the first
 * one added, sets the boss and opens the calculator.
 */
export const openLoadoutsInCalculator = async (players: Player[], monster: Monster) => {
  const added = players.slice(0, NUMBER_OF_LOADOUTS);
  let data: ImportableData = {
    serializationVersion: IMPORT_VERSION,
    loadouts: added,
    selectedLoadout: 0,
    monster,
  };
  try {
    const saved = await localforage.getItem<ImportableData>('dps-calc-state');
    if (saved && saved.serializationVersion === IMPORT_VERSION && saved.loadouts?.length
      && saved.loadouts.length + added.length <= NUMBER_OF_LOADOUTS) {
      data = { ...data, loadouts: [...saved.loadouts, ...added], selectedLoadout: saved.loadouts.length };
    }
  } catch (e) { /* no saved session: start a fresh one */ }

  await localforage.setItem('dps-calc-state', data);
  window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`);
};

export default openInCalculator;
