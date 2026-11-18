import { describe, expect, it } from 'vitest';
import { ARENA } from '../src/sim/constants';
import { Battle } from '../src/sim/battle';
import { Rng } from '../src/sim/rng';
import { randomTeams, runBattle } from '../src/sim/runner';
import type { ClassId } from '../src/sim/types';

function fight(seed: number, a: ClassId[], b: ClassId[], ticks: number): Battle {
  const battle = new Battle({ seed, teams: [a, b] });
  for (let i = 0; i < ticks && !battle.over; i++) battle.step();
  return battle;
}

describe('battle determinism', () => {
  it('produces the identical fight for the same seed', () => {
    const teams = randomTeams(new Rng(3), 4);
    const a = new Battle({ seed: 42, teams });
    const b = new Battle({ seed: 42, teams });
    for (let i = 0; i < 1500; i++) {
      a.step();
      b.step();
      expect(a.stateHash()).toBe(b.stateHash());
    }
  });

  it('produces different fights for different seeds', () => {
    const teams: [ClassId[], ClassId[]] = [
      ['knight', 'archer', 'berserker'],
      ['mage', 'assassin', 'cleric'],
    ];
    const a = fight(1, teams[0], teams[1], 600);
    const b = fight(2, teams[0], teams[1], 600);
    expect(a.stateHash()).not.toBe(b.stateHash());
  });
});

describe('battle invariants', () => {
  it('keeps hp within [0, max] and units inside the arena, and always finishes', () => {
    const rng = new Rng(11);
    const violations: string[] = [];
    const eps = 1e-6;
    for (let n = 0; n < 40; n++) {
      const size = 1 + (n % 4);
      const battle = new Battle({ seed: n, teams: randomTeams(rng, size) });
      for (let i = 0; i < 8000 && !battle.over; i++) {
        battle.step();
        // Plain comparisons (not expect() per tick) keep this fast; one assertion at the end.
        for (const u of battle.units) {
          const bad =
            u.hp < 0 ||
            u.hp > u.cls.maxHp + 1e-9 ||
            u.x < ARENA.minX - eps ||
            u.x > ARENA.maxX + eps ||
            u.y < ARENA.minY - eps ||
            u.y > ARENA.maxY + eps;
          if (bad && violations.length < 5) {
            violations.push(`battle ${n} tick ${i}: ${u.cls.id} hp=${u.hp} pos=${u.x},${u.y}`);
          }
        }
      }
      expect(battle.over, `battle ${n} finished`).toBe(true);
      expect(battle.result).not.toBeNull();
    }
    expect(violations).toEqual([]);
  }, 60_000);

  it('decides a one-sided fight for the stronger side', () => {
    const wins = Array.from({ length: 20 }, (_, i) =>
      runBattle({ seed: i, teams: [['knight', 'knight', 'knight'], ['mage']] }).winner,
    );
    expect(wins.filter((w) => w === 0).length).toBeGreaterThanOrEqual(18);
  });
});

describe('abilities', () => {
  it('cleric heals the most wounded ally and never over max hp', () => {
    const battle = new Battle({ seed: 5, teams: [['cleric', 'knight'], ['archer']] });
    const knight = battle.units.find((u) => u.cls.id === 'knight');
    const cleric = battle.units.find((u) => u.cls.id === 'cleric');
    if (!knight || !cleric) throw new Error('setup');
    knight.hp = 40;
    cleric.abilityCds[0] = 0;
    const before = knight.hp;
    battle.captainInput.ability = 0;
    battle.setCaptain(cleric.id);
    battle.captainInput.ability = 0;
    battle.step();
    expect(knight.hp).toBeGreaterThan(before);
    expect(knight.hp).toBeLessThanOrEqual(knight.cls.maxHp);
    expect(cleric.abilityCds[0]).toBeGreaterThan(0);
  });

  it('knight taunt forces nearby enemies to target the knight', () => {
    const battle = new Battle({ seed: 8, teams: [['knight', 'mage'], ['berserker', 'assassin']] });
    const knight = battle.units.find((u) => u.cls.id === 'knight');
    if (!knight) throw new Error('setup');
    for (const e of battle.enemiesOf(knight)) {
      e.x = knight.x + 60;
      e.y = knight.y;
    }
    knight.abilityCds[0] = 0;
    battle.setCaptain(knight.id);
    battle.captainInput.ability = 0;
    battle.step();
    for (const e of battle.enemiesOf(knight)) {
      expect(e.tauntedBy).toBe(knight.id);
    }
    expect(knight.takenMult).toBeLessThan(1);
    battle.step();
    for (const e of battle.enemiesOf(knight)) {
      expect(e.targetId).toBe(knight.id);
    }
  });

  it('assassin dash lands next to the target and deals damage', () => {
    const battle = new Battle({ seed: 9, teams: [['assassin'], ['mage']] });
    const assassin = battle.units.find((u) => u.cls.id === 'assassin');
    const mage = battle.units.find((u) => u.cls.id === 'mage');
    if (!assassin || !mage) throw new Error('setup');
    assassin.x = 200;
    assassin.y = 280;
    mage.x = 420;
    mage.y = 280;
    assassin.abilityCds[0] = 0;
    const before = mage.hp;
    battle.setCaptain(assassin.id);
    battle.captainInput.ability = 0;
    battle.captainInput.aimX = 1;
    battle.step();
    expect(mage.hp).toBeLessThan(before);
    expect(Math.hypot(assassin.x - mage.x, assassin.y - mage.y)).toBeLessThan(40);
  });
});

describe('captain control', () => {
  it('moves the captain with player input instead of the AI', () => {
    const battle = new Battle({ seed: 2, teams: [['knight'], ['berserker']] });
    const knight = battle.units[0];
    if (!knight) throw new Error('setup');
    battle.setCaptain(knight.id);
    const x0 = knight.x;
    const y0 = knight.y;
    battle.captainInput.moveX = 0;
    battle.captainInput.moveY = 1;
    for (let i = 0; i < 30; i++) battle.step();
    expect(knight.y).toBeGreaterThan(y0);
    expect(Math.abs(knight.x - x0)).toBeLessThan(1);
  });

  it('caps diagonal input speed to one unit of movement', () => {
    const battle = new Battle({ seed: 2, teams: [['knight'], ['berserker']] });
    const knight = battle.units[0];
    if (!knight) throw new Error('setup');
    knight.x = 480;
    knight.y = 280;
    battle.setCaptain(knight.id);
    battle.captainInput.moveX = 5;
    battle.captainInput.moveY = 5;
    battle.step();
    const moved = Math.hypot(knight.x - 480, knight.y - 280);
    expect(moved).toBeLessThanOrEqual(knight.cls.speed / 60 + 1e-6);
  });
});
