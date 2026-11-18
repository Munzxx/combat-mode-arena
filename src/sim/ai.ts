import type { Battle } from './battle';
import { ARENA } from './constants';
import { dist, norm } from './geometry';
import type { Intent, Unit } from './types';

const CENTER_X = (ARENA.minX + ARENA.maxX) / 2;
const CENTER_Y = (ARENA.minY + ARENA.maxY) / 2;
const WALL_MARGIN = 55;

export const IDLE_INTENT: Intent = { moveX: 0, moveY: 0, targetId: null, ability: null };

function nearest(u: Unit, pool: readonly Unit[]): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const o of pool) {
    const d = dist(u, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function lowestHpRatio(pool: readonly Unit[]): Unit | undefined {
  let best: Unit | undefined;
  let bestR = Infinity;
  for (const o of pool) {
    const r = o.hp / o.cls.maxHp;
    if (r < bestR) {
      bestR = r;
      best = o;
    }
  }
  return best;
}

function chooseTarget(u: Unit, enemies: readonly Unit[], b: Battle, closest: Unit): Unit {
  // A taunt overrides everything else.
  if (u.tauntedBy !== null && b.time < u.tauntUntil) {
    const taunter = enemies.find((e) => e.id === u.tauntedBy);
    if (taunter) return taunter;
  }

  let best = closest;
  if (u.cls.id === 'assassin') {
    // Hunts squishy, wounded targets; distance matters a little so it does not run across the map for nothing.
    let bestScore = Infinity;
    for (const e of enemies) {
      const squishy = e.cls.role === 'ranged' || e.cls.role === 'support' ? 60 : 0;
      const score = e.hp + dist(u, e) * 0.15 - squishy;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
  }

  // Hysteresis: keep the current target unless the new one is clearly better. Stops jittery retargeting.
  if (u.targetId !== null) {
    const cur = enemies.find((e) => e.id === u.targetId);
    if (cur && cur.id !== best.id && dist(u, cur) <= dist(u, best) * 1.25) return cur;
  }
  return best;
}

function chooseAbility(
  u: Unit,
  b: Battle,
  enemies: readonly Unit[],
  target: Unit,
): Intent['ability'] {
  const allies = b.alliesOf(u, true);
  for (let i = 0; i < u.cls.abilities.length; i++) {
    const def = u.cls.abilities[i];
    if (!def || (u.abilityCds[i] ?? 0) > 0) continue;
    const fx = def.effect;
    switch (fx.kind) {
      case 'aoeSelf': {
        const hit = enemies.filter((e) => dist(u, e) <= fx.radius + e.cls.radius).length;
        if (hit >= 1) return { index: i, targetId: null, aimX: 0, aimY: 0 };
        break;
      }
      case 'aoeTarget':
      case 'volley': {
        if (dist(u, target) <= def.range + target.cls.radius) {
          return { index: i, targetId: target.id, aimX: 0, aimY: 0 };
        }
        break;
      }
      case 'dash': {
        const d = dist(u, target);
        if (d > 90 && d <= def.range + target.cls.radius) {
          return { index: i, targetId: target.id, aimX: 0, aimY: 0 };
        }
        break;
      }
      case 'heal': {
        const hurt = lowestHpRatio(allies);
        if (
          hurt &&
          hurt.hp / hurt.cls.maxHp < 0.65 &&
          dist(u, hurt) <= def.range + hurt.cls.radius
        ) {
          return { index: i, targetId: hurt.id, aimX: 0, aimY: 0 };
        }
        break;
      }
      case 'taunt': {
        if (enemies.some((e) => dist(u, e) <= fx.radius + e.cls.radius)) {
          return { index: i, targetId: null, aimX: 0, aimY: 0 };
        }
        break;
      }
      case 'rage': {
        if (enemies.some((e) => dist(u, e) <= 220)) {
          return { index: i, targetId: null, aimX: 0, aimY: 0 };
        }
        break;
      }
    }
  }
  return null;
}

function awayFrom(u: Unit, threat: Unit): { x: number; y: number } {
  const away = norm(u.x - threat.x, u.y - threat.y);
  const nearWall =
    u.x < ARENA.minX + WALL_MARGIN ||
    u.x > ARENA.maxX - WALL_MARGIN ||
    u.y < ARENA.minY + WALL_MARGIN ||
    u.y > ARENA.maxY - WALL_MARGIN;
  if (!nearWall) return away;
  // Cornered: slide back toward the middle instead of pinning against the wall.
  const toCenter = norm(CENTER_X - u.x, CENTER_Y - u.y);
  return norm(away.x + toCenter.x * 0.9, away.y + toCenter.y * 0.9);
}

/** Autobattle brain: one decision per unit per tick. Pure function of the battle state. */
export function decide(u: Unit, b: Battle): Intent {
  const enemies = b.enemiesOf(u);
  const closest = nearest(u, enemies);
  if (!closest) return IDLE_INTENT;

  const target = chooseTarget(u, enemies, b, closest);
  u.targetId = target.id;

  const cls = u.cls;
  const reach = cls.attack.range + cls.radius + target.cls.radius;
  const dTarget = dist(u, target);
  let move = { x: 0, y: 0 };

  if (cls.role === 'melee' || cls.role === 'tank') {
    if (dTarget > reach * 0.9) move = norm(target.x - u.x, target.y - u.y);
  } else if (cls.role === 'ranged') {
    if (dist(u, closest) < cls.attack.range * 0.4) move = awayFrom(u, closest);
    else if (dTarget > reach * 0.92) move = norm(target.x - u.x, target.y - u.y);
  } else {
    // Support: stay near the wounded, away from enemies.
    const friends = b.alliesOf(u, false);
    const anchor = lowestHpRatio(friends) ?? nearest(u, friends);
    if (dist(u, closest) < 120) move = awayFrom(u, closest);
    else if (anchor && dist(u, anchor) > 140) move = norm(anchor.x - u.x, anchor.y - u.y);
    else if (!anchor && dTarget > reach * 0.92) move = norm(target.x - u.x, target.y - u.y);
  }

  return {
    moveX: move.x,
    moveY: move.y,
    targetId: target.id,
    ability: chooseAbility(u, b, enemies, target),
  };
}
