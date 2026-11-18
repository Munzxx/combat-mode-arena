export interface Vec2 {
  x: number;
  y: number;
}

export type TeamId = 0 | 1;
export type Role = 'tank' | 'melee' | 'ranged' | 'support';
export type ClassId = 'knight' | 'berserker' | 'archer' | 'mage' | 'cleric' | 'assassin';

/**
 * Ability effects are data. A new ability is a new entry in src/data/classes.ts,
 * a new kind of effect is one new case in Battle.tryAbility and the AI.
 */
export type AbilityEffect =
  | { kind: 'aoeSelf'; radius: number; damage: number }
  | { kind: 'aoeTarget'; radius: number; damage: number }
  | { kind: 'volley'; count: number; spread: number; damage: number; speed: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'dash'; damage: number }
  | { kind: 'taunt'; radius: number; duration: number; takenMult: number }
  | { kind: 'rage'; duration: number; damageMult: number; speedMult: number };

export interface AbilityDef {
  id: string;
  name: string;
  /** Seconds. */
  cooldown: number;
  /** Max distance to the target (edge to edge for enemies, ignored for self effects). */
  range: number;
  effect: AbilityEffect;
}

export interface AttackDef {
  damage: number;
  range: number;
  /** Seconds between basic attacks. */
  cooldown: number;
  /** Present for ranged attacks (pixels per second). */
  projectileSpeed?: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: Role;
  maxHp: number;
  /** Pixels per second. */
  speed: number;
  radius: number;
  attack: AttackDef;
  abilities: readonly AbilityDef[];
}

export interface Unit {
  id: number;
  team: TeamId;
  cls: ClassDef;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  atkCd: number;
  abilityCds: number[];
  targetId: number | null;
  tauntedBy: number | null;
  tauntUntil: number;
  takenMult: number;
  takenUntil: number;
  dmgMult: number;
  speedMult: number;
  buffUntil: number;
  faceX: number;
}

export interface Projectile {
  id: number;
  team: TeamId;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  ttl: number;
}

export type BattleEvent =
  | { type: 'hit'; targetId: number; sourceId: number | null; amount: number; x: number; y: number }
  | { type: 'heal'; targetId: number; sourceId: number; amount: number; x: number; y: number }
  | { type: 'death'; unitId: number; x: number; y: number }
  | { type: 'ability'; unitId: number; abilityId: string; x: number; y: number; radius: number }
  | { type: 'shot'; projectileId: number; ownerId: number }
  | { type: 'swing'; unitId: number; targetId: number }
  | { type: 'end'; winner: TeamId | null };

/** What a unit wants to do this tick. Produced by the AI or by the player's captain input. */
export interface Intent {
  moveX: number;
  moveY: number;
  /** Target for the basic attack. */
  targetId: number | null;
  ability: { index: number; targetId: number | null; aimX: number; aimY: number } | null;
}

/** Raw input for the one unit the player controls. */
export interface CaptainInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** Ability slot to fire this tick; consumed by the battle. */
  ability: number | null;
}
