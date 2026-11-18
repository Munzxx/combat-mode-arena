import type { ClassDef, ClassId } from '../sim/types';

/**
 * The six starter classes. Numbers are first-pass values; tests/balance.test.ts
 * guards the overall balance, so change them freely and let the test tell you.
 */
export const CLASSES: Record<ClassId, ClassDef> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    role: 'tank',
    maxHp: 230,
    speed: 78,
    radius: 16,
    attack: { damage: 13, range: 22, cooldown: 0.9 },
    abilities: [
      {
        id: 'shield_wall',
        name: 'Shield Wall',
        cooldown: 9,
        range: 0,
        effect: { kind: 'taunt', radius: 150, duration: 3, takenMult: 0.55 },
      },
    ],
  },
  berserker: {
    id: 'berserker',
    name: 'Berserker',
    role: 'melee',
    maxHp: 150,
    speed: 96,
    radius: 14,
    attack: { damage: 15, range: 20, cooldown: 0.7 },
    abilities: [
      {
        id: 'whirlwind',
        name: 'Whirlwind',
        cooldown: 6,
        range: 0,
        effect: { kind: 'aoeSelf', radius: 78, damage: 30 },
      },
    ],
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    role: 'ranged',
    maxHp: 92,
    speed: 92,
    radius: 12,
    attack: { damage: 11, range: 250, cooldown: 0.8, projectileSpeed: 520 },
    abilities: [
      {
        id: 'volley',
        name: 'Volley',
        cooldown: 8,
        range: 280,
        effect: { kind: 'volley', count: 5, spread: 0.5, damage: 9, speed: 560 },
      },
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    role: 'ranged',
    maxHp: 82,
    speed: 82,
    radius: 12,
    attack: { damage: 14, range: 220, cooldown: 1.1, projectileSpeed: 380 },
    abilities: [
      {
        id: 'fireball',
        name: 'Fireball',
        cooldown: 7,
        range: 280,
        effect: { kind: 'aoeTarget', radius: 72, damage: 36 },
      },
    ],
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    role: 'support',
    maxHp: 112,
    speed: 86,
    radius: 12,
    attack: { damage: 9, range: 190, cooldown: 1.0, projectileSpeed: 400 },
    abilities: [
      {
        id: 'mend',
        name: 'Mend',
        cooldown: 5,
        range: 260,
        effect: { kind: 'heal', amount: 48 },
      },
    ],
  },
  assassin: {
    id: 'assassin',
    name: 'Assassin',
    role: 'melee',
    maxHp: 102,
    speed: 122,
    radius: 11,
    attack: { damage: 14, range: 18, cooldown: 0.6 },
    abilities: [
      {
        id: 'shadow_strike',
        name: 'Shadow Strike',
        cooldown: 9,
        range: 320,
        effect: { kind: 'dash', damage: 42 },
      },
    ],
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
