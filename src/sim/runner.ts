import { CLASS_IDS } from '../data/classes';
import { Battle, type BattleConfig, type BattleResult } from './battle';
import { DT, MAX_TIME } from './constants';
import type { Rng } from './rng';
import type { ClassId } from './types';

/** Runs a full autobattle without any rendering. Used by tests and balance runs. */
export function runBattle(cfg: BattleConfig): BattleResult {
  const battle = new Battle(cfg);
  const limit = Math.ceil(MAX_TIME / DT) + 2;
  for (let i = 0; i < limit && !battle.over; i++) battle.step();
  if (!battle.result) throw new Error('Battle did not finish within the time limit');
  return battle.result;
}

/** Two random teams of the given size (classes may repeat). */
export function randomTeams(rng: Rng, size: number): [ClassId[], ClassId[]] {
  const team = (): ClassId[] => Array.from({ length: size }, () => rng.pick(CLASS_IDS));
  return [team(), team()];
}
