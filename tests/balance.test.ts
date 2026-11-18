import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../src/data/classes';
import { Rng } from '../src/sim/rng';
import { randomTeams, runBattle } from '../src/sim/runner';
import type { ClassId } from '../src/sim/types';

/**
 * Balance guard: random 3v3 fights, win rate per class counted over every fight that
 * class appeared in. It does not prove the game is balanced, it catches a class that
 * has become clearly dominant or useless after a data change.
 * Run a bigger sample with BALANCE_FIGHTS=5000 npm test.
 */
const FIGHTS = Number(process.env.BALANCE_FIGHTS ?? 600);
const MIN_RATE = 0.3;
const MAX_RATE = 0.7;

describe('class balance (random 3v3)', () => {
  it(`keeps every class between ${MIN_RATE * 100}% and ${MAX_RATE * 100}% win rate`, () => {
    const rng = new Rng(2026);
    const score = new Map<ClassId, { wins: number; games: number }>();
    for (const id of CLASS_IDS) score.set(id, { wins: 0, games: 0 });

    let draws = 0;
    let totalTime = 0;
    for (let n = 0; n < FIGHTS; n++) {
      const teams = randomTeams(rng, 3);
      const res = runBattle({ seed: n + 1, teams });
      totalTime += res.time;
      if (res.winner === null) draws++;
      teams.forEach((comp, t) => {
        for (const id of comp) {
          const s = score.get(id);
          if (!s) continue;
          s.games++;
          if (res.winner === t) s.wins++;
          else if (res.winner === null) s.wins += 0.5;
        }
      });
    }

    const report = CLASS_IDS.map((id) => {
      const s = score.get(id) ?? { wins: 0, games: 1 };
      return `${id}: ${((s.wins / s.games) * 100).toFixed(1)}%`;
    }).join('  ');
    console.log(
      `balance (${FIGHTS} fights, avg ${(totalTime / FIGHTS).toFixed(1)}s, ${draws} draws): ${report}`,
    );

    for (const id of CLASS_IDS) {
      const s = score.get(id);
      if (!s || s.games === 0) throw new Error(`class ${id} never appeared`);
      const rate = s.wins / s.games;
      expect(rate, `${id} win rate`).toBeGreaterThanOrEqual(MIN_RATE);
      expect(rate, `${id} win rate`).toBeLessThanOrEqual(MAX_RATE);
    }
  }, 120_000);
});
