import { CLASSES } from '../data/classes';
import { decide } from './ai';
import { ARENA, DT, MAX_TIME } from './constants';
import { clamp, dist, norm } from './geometry';
import { Rng } from './rng';
import type {
  AbilityDef,
  BattleEvent,
  CaptainInput,
  ClassId,
  Intent,
  Projectile,
  TeamId,
  Unit,
} from './types';

export { ARENA, DT, MAX_TIME } from './constants';

export interface BattleConfig {
  seed: number;
  teams: readonly [readonly ClassId[], readonly ClassId[]];
}

export interface BattleResult {
  winner: TeamId | null;
  time: number;
  reason: 'wipe' | 'timeout';
}

const PROJECTILE_RADIUS = 5;
const PROJECTILE_TTL = 1.6;

/**
 * Deterministic arena battle. No DOM, no Phaser, no Math.random().
 * Same config + same captain input per tick = identical fight on every device.
 */
export class Battle {
  readonly units: Unit[] = [];
  readonly projectiles: Projectile[] = [];
  tick = 0;
  time = 0;
  over = false;
  result: BattleResult | null = null;

  /** Live input for the player's captain; the UI writes to this every frame. */
  readonly captainInput: CaptainInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, ability: null };
  captainId: number | null = null;

  private readonly rng: Rng;
  private readonly byId = new Map<number, Unit>();
  private events: BattleEvent[] = [];
  private nextProjectileId = 1;

  constructor(cfg: BattleConfig) {
    this.rng = new Rng(cfg.seed);
    let id = 1;
    cfg.teams.forEach((comp, t) => {
      const team = t as TeamId;
      comp.forEach((classId, i) => {
        const cls = CLASSES[classId];
        const frontline = cls.role === 'melee' || cls.role === 'tank';
        const baseX = frontline ? 175 : 105;
        const x = team === 0 ? baseX : 960 - baseX;
        const slot = (ARENA.maxY - ARENA.minY) / (comp.length + 1);
        const y = ARENA.minY + slot * (i + 1) + (this.rng.next() - 0.5) * 14;
        const unit: Unit = {
          id: id++,
          team,
          cls,
          x,
          y,
          hp: cls.maxHp,
          alive: true,
          atkCd: this.rng.next() * 0.4,
          abilityCds: cls.abilities.map(() => 1 + this.rng.next() * 2),
          targetId: null,
          tauntedBy: null,
          tauntUntil: 0,
          takenMult: 1,
          takenUntil: 0,
          dmgMult: 1,
          speedMult: 1,
          buffUntil: 0,
          faceX: team === 0 ? 1 : -1,
        };
        this.units.push(unit);
        this.byId.set(unit.id, unit);
      });
    });
  }

  // ---- queries (also used by the AI) ----

  unit(id: number): Unit | undefined {
    return this.byId.get(id);
  }

  enemiesOf(u: Unit): Unit[] {
    return this.units.filter((o) => o.alive && o.team !== u.team);
  }

  alliesOf(u: Unit, includeSelf: boolean): Unit[] {
    return this.units.filter((o) => o.alive && o.team === u.team && (includeSelf || o.id !== u.id));
  }

  drainEvents(): BattleEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Compact fingerprint of the full state, for determinism tests. */
  stateHash(): string {
    const parts = this.units.map(
      (u) => `${u.id}:${u.hp.toFixed(2)}:${u.x.toFixed(1)}:${u.y.toFixed(1)}:${u.alive ? 1 : 0}`,
    );
    return `${this.tick}|${parts.join(',')}`;
  }

  setCaptain(id: number | null): void {
    this.captainId = id;
    this.captainInput.moveX = 0;
    this.captainInput.moveY = 0;
    this.captainInput.ability = null;
  }

  // ---- simulation ----

  step(): void {
    if (this.over) return;
    this.tick++;
    this.time = this.tick * DT;

    for (const u of this.units) {
      if (!u.alive) continue;
      u.atkCd = Math.max(0, u.atkCd - DT);
      for (let i = 0; i < u.abilityCds.length; i++) {
        u.abilityCds[i] = Math.max(0, (u.abilityCds[i] ?? 0) - DT);
      }
      if (this.time >= u.buffUntil) {
        u.dmgMult = 1;
        u.speedMult = 1;
      }
      if (this.time >= u.takenUntil) u.takenMult = 1;
      if (u.tauntedBy !== null && this.time >= u.tauntUntil) u.tauntedBy = null;
    }

    // Decide first, act second, so unit order does not leak into decisions.
    const intents: Array<[Unit, Intent]> = [];
    for (const u of this.units) {
      if (!u.alive) continue;
      intents.push([u, u.id === this.captainId ? this.captainIntent(u) : decide(u, this)]);
    }

    for (const [u, intent] of intents) this.move(u, intent);
    this.separate();
    for (const [u, intent] of intents) {
      if (u.alive) this.act(u, intent);
    }
    this.updateProjectiles();
    this.checkEnd();
  }

  private captainIntent(u: Unit): Intent {
    const inp = this.captainInput;
    const len = Math.hypot(inp.moveX, inp.moveY);
    const scale = len > 1 ? 1 / len : 1;

    let target: Unit | null = null;
    let bestD = Infinity;
    for (const e of this.enemiesOf(u)) {
      const d = dist(u, e);
      if (d <= u.cls.attack.range + u.cls.radius + e.cls.radius && d < bestD) {
        bestD = d;
        target = e;
      }
    }
    u.targetId = target ? target.id : null;

    const ability =
      inp.ability !== null
        ? { index: inp.ability, targetId: null, aimX: inp.aimX, aimY: inp.aimY }
        : null;
    inp.ability = null;

    return {
      moveX: inp.moveX * scale,
      moveY: inp.moveY * scale,
      targetId: target ? target.id : null,
      ability,
    };
  }

  private move(u: Unit, intent: Intent): void {
    const speed = u.cls.speed * u.speedMult * DT;
    if (intent.moveX !== 0 || intent.moveY !== 0) {
      u.x += intent.moveX * speed;
      u.y += intent.moveY * speed;
      if (Math.abs(intent.moveX) > 0.05) u.faceX = intent.moveX > 0 ? 1 : -1;
    }
    this.clampToArena(u);
  }

  private clampToArena(u: Unit): void {
    u.x = clamp(u.x, ARENA.minX, ARENA.maxX);
    u.y = clamp(u.y, ARENA.minY, ARENA.maxY);
  }

  /** Soft push so units do not stack on top of each other. */
  private separate(): void {
    const live = this.units.filter((u) => u.alive);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i] as Unit;
        const b = live[j] as Unit;
        const minD = a.cls.radius + b.cls.radius;
        const d = dist(a, b);
        if (d >= minD) continue;
        const n = d < 1e-6 ? { x: 1, y: 0 } : norm(b.x - a.x, b.y - a.y);
        const push = (minD - d) / 2;
        a.x -= n.x * push;
        a.y -= n.y * push;
        b.x += n.x * push;
        b.y += n.y * push;
        this.clampToArena(a);
        this.clampToArena(b);
      }
    }
  }

  private act(u: Unit, intent: Intent): void {
    if (intent.ability) this.tryAbility(u, intent.ability);
    if (u.atkCd > 0 || intent.targetId === null) return;
    const t = this.byId.get(intent.targetId);
    if (!t || !t.alive || t.team === u.team) return;
    if (dist(u, t) > u.cls.attack.range + u.cls.radius + t.cls.radius) return;
    this.basicAttack(u, t);
  }

  private roll(u: Unit, base: number): number {
    const buff = this.time < u.buffUntil ? u.dmgMult : 1;
    return base * buff * (0.9 + this.rng.next() * 0.2);
  }

  private face(u: Unit, towardX: number): void {
    if (Math.abs(towardX - u.x) > 1) u.faceX = towardX > u.x ? 1 : -1;
  }

  private basicAttack(u: Unit, t: Unit): void {
    const atk = u.cls.attack;
    u.atkCd = atk.cooldown;
    this.face(u, t.x);
    if (atk.projectileSpeed !== undefined) {
      const dir = norm(t.x - u.x, t.y - u.y);
      this.spawnProjectile(u, dir.x, dir.y, atk.projectileSpeed, this.roll(u, atk.damage));
    } else {
      this.events.push({ type: 'swing', unitId: u.id, targetId: t.id });
      this.dealDamage(u.id, t, this.roll(u, atk.damage));
    }
  }

  private spawnProjectile(u: Unit, dx: number, dy: number, speed: number, damage: number): void {
    const p: Projectile = {
      id: this.nextProjectileId++,
      team: u.team,
      ownerId: u.id,
      x: u.x,
      y: u.y,
      vx: dx * speed,
      vy: dy * speed,
      radius: PROJECTILE_RADIUS,
      damage,
      ttl: PROJECTILE_TTL,
    };
    this.projectiles.push(p);
    this.events.push({ type: 'shot', projectileId: p.id, ownerId: u.id });
  }

  private dealDamage(sourceId: number | null, t: Unit, base: number): void {
    if (!t.alive) return;
    const mult = this.time < t.takenUntil ? t.takenMult : 1;
    const amount = Math.max(0, base * mult);
    t.hp -= amount;
    this.events.push({ type: 'hit', targetId: t.id, sourceId, amount, x: t.x, y: t.y });
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      this.events.push({ type: 'death', unitId: t.id, x: t.x, y: t.y });
    }
  }

  private resolveTarget(
    u: Unit,
    def: AbilityDef,
    req: NonNullable<Intent['ability']>,
    kind: 'enemy' | 'ally',
  ): Unit | null {
    const pool = kind === 'enemy' ? this.enemiesOf(u) : this.alliesOf(u, true);
    const inRange = (t: Unit): boolean => dist(u, t) <= def.range + t.cls.radius;

    if (req.targetId !== null) {
      const t = pool.find((o) => o.id === req.targetId);
      if (t && inRange(t)) return t;
    }

    if (kind === 'ally') {
      let best: Unit | null = null;
      let bestR = Infinity;
      for (const t of pool) {
        const r = t.hp / t.cls.maxHp;
        if (inRange(t) && r < bestR) {
          bestR = r;
          best = t;
        }
      }
      return best;
    }

    // Enemy: with an aim direction pick the one closest to the aimed point, else the nearest.
    const aim = norm(req.aimX, req.aimY);
    const hasAim = aim.x !== 0 || aim.y !== 0;
    const px = u.x + aim.x * def.range * 0.7;
    const py = u.y + aim.y * def.range * 0.7;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const t of pool) {
      if (!inRange(t)) continue;
      const d = hasAim ? Math.hypot(t.x - px, t.y - py) : dist(u, t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private tryAbility(u: Unit, req: NonNullable<Intent['ability']>): boolean {
    const def = u.cls.abilities[req.index];
    if (!def || (u.abilityCds[req.index] ?? 0) > 0) return false;
    const fx = def.effect;
    let used = false;

    switch (fx.kind) {
      case 'aoeSelf': {
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: u.x,
          y: u.y,
          radius: fx.radius,
        });
        for (const e of this.enemiesOf(u)) {
          if (dist(u, e) <= fx.radius + e.cls.radius) {
            this.dealDamage(u.id, e, this.roll(u, fx.damage));
          }
        }
        used = true;
        break;
      }
      case 'aoeTarget': {
        const t = this.resolveTarget(u, def, req, 'enemy');
        if (!t) break;
        this.face(u, t.x);
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: t.x,
          y: t.y,
          radius: fx.radius,
        });
        for (const e of this.enemiesOf(u)) {
          if (dist(t, e) <= fx.radius + e.cls.radius) {
            this.dealDamage(u.id, e, this.roll(u, fx.damage));
          }
        }
        used = true;
        break;
      }
      case 'volley': {
        const t = this.resolveTarget(u, def, req, 'enemy');
        if (!t) break;
        this.face(u, t.x);
        const base = Math.atan2(t.y - u.y, t.x - u.x);
        const n = fx.count;
        for (let k = 0; k < n; k++) {
          const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * fx.spread;
          const a = base + off;
          this.spawnProjectile(u, Math.cos(a), Math.sin(a), fx.speed, this.roll(u, fx.damage));
        }
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: u.x,
          y: u.y,
          radius: 0,
        });
        used = true;
        break;
      }
      case 'heal': {
        const t = this.resolveTarget(u, def, req, 'ally');
        if (!t) break;
        const healed = Math.min(fx.amount, t.cls.maxHp - t.hp);
        t.hp += healed;
        this.events.push({
          type: 'heal',
          targetId: t.id,
          sourceId: u.id,
          amount: healed,
          x: t.x,
          y: t.y,
        });
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: t.x,
          y: t.y,
          radius: 0,
        });
        used = true;
        break;
      }
      case 'dash': {
        const t = this.resolveTarget(u, def, req, 'enemy');
        if (!t) break;
        const gap = u.cls.radius + t.cls.radius + 3;
        const dir = norm(u.x - t.x, u.y - t.y);
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: u.x,
          y: u.y,
          radius: 0,
        });
        u.x = t.x + dir.x * gap;
        u.y = t.y + dir.y * gap;
        this.clampToArena(u);
        this.face(u, t.x);
        this.dealDamage(u.id, t, this.roll(u, fx.damage));
        used = true;
        break;
      }
      case 'taunt': {
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: u.x,
          y: u.y,
          radius: fx.radius,
        });
        for (const e of this.enemiesOf(u)) {
          if (dist(u, e) <= fx.radius + e.cls.radius) {
            e.tauntedBy = u.id;
            e.tauntUntil = this.time + fx.duration;
          }
        }
        u.takenMult = fx.takenMult;
        u.takenUntil = this.time + fx.duration;
        used = true;
        break;
      }
      case 'rage': {
        u.dmgMult = fx.damageMult;
        u.speedMult = fx.speedMult;
        u.buffUntil = this.time + fx.duration;
        this.events.push({
          type: 'ability',
          unitId: u.id,
          abilityId: def.id,
          x: u.x,
          y: u.y,
          radius: 0,
        });
        used = true;
        break;
      }
    }

    if (used) u.abilityCds[req.index] = def.cooldown;
    return used;
  }

  private updateProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i] as Projectile;
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.ttl -= DT;

      let remove = p.ttl <= 0 || p.x < 0 || p.x > 960 || p.y < 0 || p.y > 540;
      if (!remove) {
        for (const e of this.units) {
          if (!e.alive || e.team === p.team) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= e.cls.radius + p.radius) {
            this.dealDamage(p.ownerId, e, p.damage);
            remove = true;
            break;
          }
        }
      }
      if (remove) this.projectiles.splice(i, 1);
    }
  }

  private checkEnd(): void {
    let hp0 = 0;
    let hp1 = 0;
    let alive0 = 0;
    let alive1 = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.team === 0) {
        alive0++;
        hp0 += u.hp;
      } else {
        alive1++;
        hp1 += u.hp;
      }
    }

    let winner: TeamId | null | undefined;
    let reason: BattleResult['reason'] = 'wipe';
    if (alive0 === 0 && alive1 === 0) winner = null;
    else if (alive0 === 0) winner = 1;
    else if (alive1 === 0) winner = 0;
    else if (this.time >= MAX_TIME) {
      reason = 'timeout';
      winner = hp0 > hp1 ? 0 : hp1 > hp0 ? 1 : null;
    }

    if (winner === undefined) return;
    this.over = true;
    this.result = { winner, time: this.time, reason };
    this.events.push({ type: 'end', winner });
  }
}
