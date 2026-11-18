import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { drawArena } from '../render/arena';
import { unitTexture } from '../render/textures';
import { Battle } from '../sim/battle';
import { DT } from '../sim/constants';
import { Rng } from '../sim/rng';
import { randomTeams } from '../sim/runner';
import type { BattleEvent, ClassId, TeamId, Unit } from '../sim/types';
import { APP_VERSION } from '../version';

const FONT = 'monospace';
const DEFAULT_TEAMS: [ClassId[], ClassId[]] = [
  ['knight', 'archer', 'cleric'],
  ['berserker', 'mage', 'assassin'],
];
const ABILITY_COLORS: Record<string, number> = {
  shield_wall: 0x8fb4ff,
  whirlwind: 0xff8a5a,
  volley: 0xc9e08a,
  fireball: 0xff7a2a,
  mend: 0x7dff9a,
  shadow_strike: 0xb48aff,
};
const PROJECTILE_COLORS: Partial<Record<ClassId, number>> = {
  archer: 0xe8d9a0,
  mage: 0xff8a3a,
  cleric: 0xf6e27a,
};
const STICK_RADIUS = 58;
const SPEEDS = [1, 2, 3] as const;

/** Sprite scale for a class: the art is ~1.35x its simulation radius so fighters stay readable on a phone. */
function unitScale(radius: number): number {
  return (1.35 * radius) / 12;
}

type Mode = 'auto' | 'captain';

interface UnitView {
  sprite: Phaser.GameObjects.Image;
  lastX: number;
  lastY: number;
  bob: number;
  lunge: number;
  flashUntil: number;
  gone: boolean;
}

interface ButtonHandle {
  setLabel(text: string): void;
}

export class BattleScene extends Phaser.Scene {
  private battle!: Battle;
  private views = new Map<number, UnitView>();
  private projectileViews = new Map<number, Phaser.GameObjects.Arc>();

  private mode: Mode = 'auto';
  private teamSize = 3;
  private speedIndex = 0;
  private acc = 0;
  private hitStop = 0;
  private firstFight = true;

  private bars!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private abilityGfx!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private abilityLabel!: Phaser.GameObjects.Text;
  private modeBtn!: ButtonHandle;
  private speedBtn!: ButtonHandle;
  private sizeBtn!: ButtonHandle;

  private abilityZone: Phaser.GameObjects.Zone | null = null;
  private stickId: number | null = null;
  private stickOx = 0;
  private stickOy = 0;
  private stickDx = 0;
  private stickDy = 0;
  private downs = new Map<number, { t: number; x: number; y: number }>();
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  } | null;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    drawArena(this);

    this.bars = this.add.graphics().setDepth(4000);
    this.hud = this.add.graphics().setDepth(5000);
    this.stickGfx = this.add.graphics().setDepth(6500);
    this.abilityGfx = this.add.graphics().setDepth(6000);

    this.timerText = this.add
      .text(GAME_WIDTH / 2, 18, '0:00', { fontFamily: FONT, fontSize: '20px', color: '#f1d9a0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#000000', 4)
      .setDepth(5001);

    this.abilityLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(6002)
      .setVisible(false);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 10, GAME_WIDTH, 20, 0x000000, 0.6).setDepth(5000);
    this.hintText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 12, '', { fontFamily: FONT, fontSize: '13px', color: '#d8c8a0' })
      .setOrigin(0.5)
      .setStroke('#000000', 3)
      .setDepth(5001);

    this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 5, `v${APP_VERSION}`, { fontFamily: FONT, fontSize: '11px', color: '#8a7a5a' })
      .setOrigin(1, 1)
      .setDepth(5001);

    this.banner = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16, '', {
        fontFamily: FONT,
        fontSize: '64px',
        color: '#f1d9a0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 8)
      .setDepth(7000)
      .setVisible(false);
    this.bannerSub = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 36, 'Tap NEW for another fight', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 5)
      .setDepth(7000)
      .setVisible(false);

    // Top-right buttons (kept clear of the arena floor).
    this.modeBtn = this.makeButton(GAME_WIDTH - 372, 18, 112, 28, 'AUTO', () => this.toggleMode());
    this.speedBtn = this.makeButton(GAME_WIDTH - 276, 18, 72, 28, '1x', () => this.cycleSpeed());
    this.sizeBtn = this.makeButton(GAME_WIDTH - 192, 18, 80, 28, '3v3', () => this.cycleSize());
    this.makeButton(GAME_WIDTH - 96, 18, 80, 28, 'NEW', () => this.newFight());

    this.setupInput();
    this.startBattle(DEFAULT_TEAMS, 1337);
  }

  // ---------------------------------------------------------------- setup

  private setupInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = {
        up: kb.addKey(K.UP),
        down: kb.addKey(K.DOWN),
        left: kb.addKey(K.LEFT),
        right: kb.addKey(K.RIGHT),
        w: kb.addKey(K.W),
        a: kb.addKey(K.A),
        s: kb.addKey(K.S),
        d: kb.addKey(K.D),
        space: kb.addKey(K.SPACE),
      };
      kb.on('keydown-SPACE', () => this.pressAbility(0));
      kb.on('keydown-ONE', () => this.pressAbility(0));
      kb.on('keydown-TAB', (e: KeyboardEvent) => {
        e.preventDefault();
        this.toggleMode();
      });
    } else {
      this.keys = null;
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return;
      this.downs.set(p.id, { t: this.time.now, x: p.x, y: p.y });
      if (this.mode === 'captain' && this.stickId === null && p.x < GAME_WIDTH * 0.55) {
        this.stickId = p.id;
        this.stickOx = p.x;
        this.stickOy = p.y;
        this.stickDx = 0;
        this.stickDy = 0;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickId) return;
      let dx = p.x - this.stickOx;
      let dy = p.y - this.stickOy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      this.stickDx = dx;
      this.stickDy = dy;
    });

    const release = (p: Phaser.Input.Pointer): void => {
      if (p.id === this.stickId) {
        this.stickId = null;
        this.stickDx = 0;
        this.stickDy = 0;
      }
      const d = this.downs.get(p.id);
      this.downs.delete(p.id);
      // A quick tap on one of your own units takes control of it.
      if (d && this.time.now - d.t < 280 && Math.hypot(p.x - d.x, p.y - d.y) < 14) {
        this.trySelectAt(p.x, p.y);
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onTap: () => void): ButtonHandle {
    const bg = this.add
      .rectangle(x, y, w, h, 0x2b2218)
      .setStrokeStyle(2, 0x8a6a3b)
      .setDepth(6000)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '15px', color: '#f1d9a0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(6001);
    bg.on('pointerdown', () => {
      bg.setFillStyle(0x4a3a22);
      onTap();
    });
    bg.on('pointerup', () => bg.setFillStyle(0x2b2218));
    bg.on('pointerout', () => bg.setFillStyle(0x2b2218));
    return { setLabel: (t: string) => txt.setText(t) };
  }

  // -------------------------------------------------------------- lifecycle

  private startBattle(teams: [ClassId[], ClassId[]], seed: number): void {
    for (const v of this.views.values()) v.sprite.destroy();
    this.views.clear();
    for (const p of this.projectileViews.values()) p.destroy();
    this.projectileViews.clear();

    this.battle = new Battle({ seed, teams });
    this.acc = 0;
    this.hitStop = 0;
    this.banner.setVisible(false);
    this.bannerSub.setVisible(false);

    for (const u of this.battle.units) {
      const sprite = this.add
        .image(u.x, u.y, unitTexture(u.cls.id, u.team))
        .setOrigin(0.5, 0.83)
        .setScale(unitScale(u.cls.radius));
      this.views.set(u.id, {
        sprite,
        lastX: u.x,
        lastY: u.y,
        bob: 0,
        lunge: 0,
        flashUntil: 0,
        gone: false,
      });
    }

    if (this.mode === 'captain') this.selectCaptain(this.firstAlly()?.id ?? null);
    else this.battle.setCaptain(null);
    this.updateHint();
  }

  private newFight(): void {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const teams =
      this.firstFight && this.teamSize === 3
        ? DEFAULT_TEAMS
        : randomTeams(new Rng(seed ^ 0x9e3779b9), this.teamSize);
    this.firstFight = false;
    this.startBattle(teams, seed);
  }

  private cycleSize(): void {
    this.teamSize = this.teamSize >= 4 ? 1 : this.teamSize + 1;
    this.sizeBtn.setLabel(`${this.teamSize}v${this.teamSize}`);
    this.firstFight = false;
    this.newFight();
  }

  private cycleSpeed(): void {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.speedBtn.setLabel(`${SPEEDS[this.speedIndex]}x`);
  }

  private toggleMode(): void {
    if (this.mode === 'auto') {
      this.mode = 'captain';
      this.modeBtn.setLabel('CAPTAIN');
      this.selectCaptain(this.firstAlly()?.id ?? null);
    } else {
      this.mode = 'auto';
      this.modeBtn.setLabel('AUTO');
      this.battle.setCaptain(null);
      this.stickId = null;
      this.stickDx = 0;
      this.stickDy = 0;
    }
    this.updateHint();
  }

  private firstAlly(): Unit | undefined {
    return this.battle.units.find((u) => u.team === 0 && u.alive);
  }

  private selectCaptain(id: number | null): void {
    this.battle.setCaptain(id);
  }

  private trySelectAt(x: number, y: number): void {
    let best: Unit | null = null;
    let bestD = 38;
    for (const u of this.battle.units) {
      if (u.team !== 0 || !u.alive) continue;
      const d = Math.hypot(u.x - x, u.y - 8 - y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    if (!best) return;
    if (this.mode === 'auto') {
      this.mode = 'captain';
      this.modeBtn.setLabel('CAPTAIN');
    }
    this.selectCaptain(best.id);
    this.updateHint();
  }

  private updateHint(): void {
    const cap = this.captainUnit();
    this.hintText.setText(
      this.mode === 'auto'
        ? 'Autobattle - tap one of your fighters (or CAPTAIN) to take control'
        : cap
          ? `You control the ${cap.cls.name}: drag left to move, ability button on the right`
          : 'No fighter left to control',
    );
  }

  private captainUnit(): Unit | null {
    const id = this.battle.captainId;
    if (id === null) return null;
    const u = this.battle.unit(id);
    return u && u.alive ? u : null;
  }

  // --------------------------------------------------------------- per frame

  override update(_time: number, delta: number): void {
    const real = Math.min(delta, 100) / 1000;
    this.updateCaptainInput();

    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - real);
    } else {
      this.acc += real * (SPEEDS[this.speedIndex] ?? 1);
      let steps = 0;
      while (this.acc >= DT && !this.battle.over && steps < 12) {
        this.battle.step();
        this.acc -= DT;
        steps++;
        this.handleEvents(this.battle.drainEvents());
        if (this.hitStop > 0) break;
      }
      if (steps >= 12) this.acc = 0;
    }

    // Captain died: fall back to the next living ally, or to autobattle.
    if (this.mode === 'captain' && !this.battle.over && !this.captainUnit()) {
      const next = this.firstAlly();
      if (next) this.selectCaptain(next.id);
      else this.battle.setCaptain(null);
      this.updateHint();
    }

    this.syncViews(real);
    this.drawBars();
    this.drawHud();
    this.drawControls();
  }

  private updateCaptainInput(): void {
    if (this.mode !== 'captain' || this.battle.captainId === null) return;
    let mx = this.stickDx / STICK_RADIUS;
    let my = this.stickDy / STICK_RADIUS;
    const k = this.keys;
    if (k) {
      if (k.left.isDown || k.a.isDown) mx -= 1;
      if (k.right.isDown || k.d.isDown) mx += 1;
      if (k.up.isDown || k.w.isDown) my -= 1;
      if (k.down.isDown || k.s.isDown) my += 1;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    // Small dead zone so a resting thumb does not drift the captain.
    if (len < 0.12) {
      mx = 0;
      my = 0;
    }
    const inp = this.battle.captainInput;
    inp.moveX = mx;
    inp.moveY = my;
    if (mx !== 0 || my !== 0) {
      inp.aimX = mx;
      inp.aimY = my;
    } else {
      const cap = this.captainUnit();
      if (cap) {
        inp.aimX = cap.faceX;
        inp.aimY = 0;
      }
    }
  }

  private pressAbility(index: number): void {
    if (this.mode !== 'captain' || this.battle.over) return;
    const cap = this.captainUnit();
    if (!cap) return;
    this.battle.captainInput.ability = index;
  }

  // ----------------------------------------------------------------- events

  private handleEvents(events: BattleEvent[]): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'hit': {
          const target = this.battle.unit(ev.targetId);
          const view = this.views.get(ev.targetId);
          if (view && target) {
            view.flashUntil = this.time.now + 90;
            view.sprite.setTint(0xff7070);
            view.sprite.setScale(unitScale(target.cls.radius) * 1.12);
          }
          const big = ev.amount >= 28;
          this.floatText(
            ev.x,
            ev.y - (target ? target.cls.radius + 14 : 20),
            String(Math.round(ev.amount)),
            target && target.team === 0 ? '#ff7b7b' : '#ffffff',
            big ? 26 : 17,
          );
          this.sparks(ev.x, ev.y - 8, target && target.team === 0 ? 0xff5a5a : 0xffd070, big ? 8 : 4);
          if (big) this.hitStop = Math.max(this.hitStop, 0.045);
          if (ev.targetId === this.battle.captainId) this.cameras.main.shake(90, 0.004);
          break;
        }
        case 'heal': {
          if (ev.amount > 0.5) {
            this.floatText(ev.x, ev.y - 30, `+${Math.round(ev.amount)}`, '#7dff9a', 18);
            this.sparks(ev.x, ev.y - 8, 0x7dff9a, 6);
          }
          break;
        }
        case 'death': {
          const view = this.views.get(ev.unitId);
          if (view && !view.gone) {
            view.gone = true;
            this.tweens.add({
              targets: view.sprite,
              alpha: 0,
              y: view.sprite.y - 14,
              angle: view.sprite.flipX ? -50 : 50,
              duration: 420,
              ease: 'Quad.easeOut',
            });
          }
          this.sparks(ev.x, ev.y - 8, 0xffe3a0, 14);
          this.hitStop = Math.max(this.hitStop, 0.075);
          this.cameras.main.shake(130, 0.006);
          break;
        }
        case 'ability': {
          const color = ABILITY_COLORS[ev.abilityId] ?? 0xffffff;
          const r = ev.radius > 0 ? ev.radius : 22;
          const ring = this.add.circle(ev.x, ev.y, r, color, 0.16).setStrokeStyle(4, color, 0.95).setDepth(3500);
          this.tweens.add({
            targets: ring,
            scale: ev.radius > 0 ? 1.12 : 1.9,
            alpha: 0,
            duration: 420,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
          });
          if (ev.radius >= 60) this.cameras.main.shake(110, 0.004);
          break;
        }
        case 'swing': {
          const v = this.views.get(ev.unitId);
          if (v) v.lunge = 1;
          break;
        }
        case 'shot':
          break;
        case 'end':
          this.showResult(ev.winner);
          break;
      }
    }
  }

  private showResult(winner: TeamId | null): void {
    let text = 'DRAW';
    let color = '#d8c8a0';
    if (winner === 0) {
      text = 'VICTORY';
      color = '#7dff9a';
    } else if (winner === 1) {
      text = 'DEFEAT';
      color = '#ff7b7b';
    }
    this.banner.setText(text).setColor(color).setVisible(true).setScale(0.6).setAlpha(0);
    this.bannerSub.setVisible(true);
    this.tweens.add({ targets: this.banner, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.hintText.setText('');
  }

  private floatText(x: number, y: number, text: string, color: string, size: number): void {
    const t = this.add
      .text(x + (Math.random() - 0.5) * 14, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#000000', 4)
      .setDepth(4500);
    this.tweens.add({
      targets: t,
      y: y - 30,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private sparks(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.add.image(x, y, 'spark').setTint(color).setDepth(4400);
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 26;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d - 6,
        alpha: 0,
        scale: 0.2,
        duration: 260 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
  }

  // -------------------------------------------------------------- rendering

  private syncViews(real: number): void {
    const now = this.time.now;
    for (const u of this.battle.units) {
      const v = this.views.get(u.id);
      if (!v || v.gone) continue;

      const moved = Math.hypot(u.x - v.lastX, u.y - v.lastY);
      v.lastX = u.x;
      v.lastY = u.y;
      if (moved > 0.05) v.bob += real * 16;
      const bob = moved > 0.05 ? Math.abs(Math.sin(v.bob)) * 3 : 0;
      v.lunge = Math.max(0, v.lunge - real * 7);

      if (now >= v.flashUntil) {
        v.sprite.clearTint();
        const base = unitScale(u.cls.radius);
        if (v.sprite.scaleX !== base) v.sprite.setScale(base);
      }

      v.sprite.setFlipX(u.faceX < 0);
      v.sprite.setPosition(u.x + u.faceX * v.lunge * 7, u.y + 6 - bob);
      v.sprite.setDepth(u.y);
    }

    // Projectiles: create on first sight, move every frame, remove when gone.
    const live = new Set<number>();
    for (const p of this.battle.projectiles) {
      live.add(p.id);
      let a = this.projectileViews.get(p.id);
      if (!a) {
        const owner = this.battle.unit(p.ownerId);
        const color = (owner && PROJECTILE_COLORS[owner.cls.id]) ?? 0xffffff;
        a = this.add.circle(p.x, p.y, owner?.cls.id === 'mage' ? 7 : 4, color).setStrokeStyle(2, 0x000000, 0.5);
        this.projectileViews.set(p.id, a);
      }
      a.setPosition(p.x, p.y - 8).setDepth(p.y + 100);
    }
    for (const [id, a] of this.projectileViews) {
      if (!live.has(id)) {
        a.destroy();
        this.projectileViews.delete(id);
      }
    }
  }

  private drawBars(): void {
    const g = this.bars;
    g.clear();
    const cap = this.captainUnit();
    for (const u of this.battle.units) {
      const v = this.views.get(u.id);
      if (!u.alive || !v) continue;
      const w = 34;
      const x = u.x - w / 2;
      const y = u.y + 6 - 34 * unitScale(u.cls.radius) - 12;
      const ratio = Phaser.Math.Clamp(u.hp / u.cls.maxHp, 0, 1);
      g.fillStyle(0x000000, 0.75).fillRect(x - 1, y - 1, w + 2, 7);
      g.fillStyle(u.team === 0 ? 0x4aa0ff : 0xe0524a, 1).fillRect(x, y, w * ratio, 5);
      if (cap && cap.id === u.id) {
        g.lineStyle(3, 0xffd24a, 1).strokeEllipse(u.x, u.y + 8, u.cls.radius * 2.6, u.cls.radius * 1.2);
        g.fillStyle(0xffd24a, 1).fillTriangle(u.x - 6, y - 12, u.x + 6, y - 12, u.x, y - 4);
      }
    }
  }

  private drawHud(): void {
    const g = this.hud;
    g.clear();
    let hp0 = 0;
    let max0 = 0;
    let hp1 = 0;
    let max1 = 0;
    for (const u of this.battle.units) {
      if (u.team === 0) {
        max0 += u.cls.maxHp;
        hp0 += u.hp;
      } else {
        max1 += u.cls.maxHp;
        hp1 += u.hp;
      }
    }
    const barW = 200;
    const barH = 14;
    g.fillStyle(0x000000, 0.7).fillRect(10, 11, barW + 4, barH + 4);
    g.fillStyle(0x4aa0ff, 1).fillRect(12, 13, barW * (max0 ? hp0 / max0 : 0), barH);
    const ex = 12 + barW + 16;
    g.fillStyle(0x000000, 0.7).fillRect(ex - 2, 11, barW + 4, barH + 4);
    g.fillStyle(0xe0524a, 1).fillRect(ex, 13, barW * (max1 ? hp1 / max1 : 0), barH);

    const t = Math.floor(this.battle.time);
    this.timerText.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.timerText.setPosition(ex + barW + 44, 18);
  }

  private drawControls(): void {
    const sg = this.stickGfx;
    sg.clear();
    if (this.stickId !== null) {
      sg.lineStyle(3, 0xf1d9a0, 0.5).strokeCircle(this.stickOx, this.stickOy, STICK_RADIUS);
      sg.fillStyle(0xf1d9a0, 0.18).fillCircle(this.stickOx, this.stickOy, STICK_RADIUS);
      sg.fillStyle(0xf1d9a0, 0.7).fillCircle(this.stickOx + this.stickDx, this.stickOy + this.stickDy, 22);
    }

    const ag = this.abilityGfx;
    ag.clear();
    this.abilityLabel.setVisible(false);
    const cap = this.captainUnit();
    if (this.mode !== 'captain' || !cap || this.battle.over) {
      this.abilityZone?.disableInteractive();
      return;
    }
    const def = cap.cls.abilities[0];
    if (!def) return;
    const cx = GAME_WIDTH - 84;
    const cy = GAME_HEIGHT - 92;
    const r = 52;
    const cd = cap.abilityCds[0] ?? 0;
    const ready = cd <= 0;
    const color = ABILITY_COLORS[def.id] ?? 0xffffff;

    ag.fillStyle(0x000000, 0.55).fillCircle(cx, cy, r + 4);
    ag.fillStyle(ready ? color : 0x3a3228, ready ? 0.9 : 1).fillCircle(cx, cy, r);
    ag.lineStyle(4, ready ? 0xffffff : 0x6a5a40, 1).strokeCircle(cx, cy, r);
    if (!ready) {
      const frac = Phaser.Math.Clamp(cd / def.cooldown, 0, 1);
      ag.fillStyle(0x000000, 0.55);
      ag.beginPath();
      ag.moveTo(cx, cy);
      ag.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      ag.closePath();
      ag.fillPath();
    }
    this.abilityLabel
      .setPosition(cx, cy)
      .setText(ready ? def.name.replace(' ', '\n') : cd.toFixed(1))
      .setFontSize(ready ? 14 : 20)
      .setVisible(true);

    if (!this.abilityZone) {
      this.abilityZone = this.add.zone(cx, cy, r * 2.2, r * 2.2).setDepth(6003).setInteractive();
      this.abilityZone.on('pointerdown', () => this.pressAbility(0));
    } else {
      this.abilityZone.setInteractive();
    }
  }

}
