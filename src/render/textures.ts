import type Phaser from 'phaser';
import { CLASSES } from '../data/classes';
import type { ClassId } from '../sim/types';

/**
 * Placeholder art: small pixel sprites drawn from code, one per class and team.
 * Everything goes through `unitTexture()`, so real sprite sheets can replace this
 * file later without touching the battle scene.
 */
const PALETTE: Record<ClassId, { body: number; trim: number; weapon: number }> = {
  knight: { body: 0x8d9bb0, trim: 0xd9e2ee, weapon: 0xe8e8e8 },
  berserker: { body: 0xa8452f, trim: 0xe08a5a, weapon: 0xc9c9c9 },
  archer: { body: 0x4f8a45, trim: 0xa8d68a, weapon: 0x8b5a2b },
  mage: { body: 0x5b4aa8, trim: 0xa99bf0, weapon: 0xf2c94c },
  cleric: { body: 0xd8d2b8, trim: 0xf6f0d8, weapon: 0xf2c94c },
  assassin: { body: 0x35323f, trim: 0x7a6f96, weapon: 0xb5b5c4 },
};

const TEAM_COLOR = [0x3a7bd5, 0xd5473a] as const;
const SIZE = 48;
const PX = 3; // one "art pixel" = 3 screen pixels, so sprites look chunky and crisp

export function unitTexture(cls: ClassId, team: 0 | 1): string {
  return `unit_${cls}_${team}`;
}

function put(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: number): void {
  g.fillStyle(c, 1).fillRect(x * PX, y * PX, w * PX, h * PX);
}

function drawUnit(g: Phaser.GameObjects.Graphics, id: ClassId, team: 0 | 1): void {
  const pal = PALETTE[id];
  const tc = TEAM_COLOR[team];
  const skin = 0xe2b98c;
  const dark = 0x1b1713;

  // Ground shadow + team ring.
  g.fillStyle(0x000000, 0.28).fillEllipse(SIZE / 2, SIZE - 8, 30, 10);
  g.lineStyle(2, tc, 1).strokeEllipse(SIZE / 2, SIZE - 8, 30, 10);

  // Legs.
  put(g, 6, 11, 2, 3, dark);
  put(g, 8, 11, 2, 3, dark);
  // Body.
  put(g, 5, 6, 6, 5, pal.body);
  put(g, 5, 6, 6, 1, pal.trim);
  put(g, 5, 10, 6, 1, tc); // team-colored belt
  // Head.
  put(g, 6, 2, 4, 4, skin);
  put(g, 7, 3, 1, 1, dark);
  put(g, 9, 3, 1, 1, dark);

  switch (id) {
    case 'knight':
      put(g, 5, 1, 6, 2, pal.trim); // helmet
      put(g, 2, 7, 3, 4, pal.trim); // shield
      put(g, 2, 7, 3, 1, tc);
      put(g, 11, 5, 1, 6, pal.weapon); // sword
      break;
    case 'berserker':
      put(g, 5, 1, 6, 1, 0x6b3a1e); // hair
      put(g, 11, 4, 1, 7, 0x6b4a2b); // axe handle
      put(g, 12, 4, 2, 3, pal.weapon);
      break;
    case 'archer':
      put(g, 5, 1, 6, 2, pal.body); // hood
      put(g, 12, 4, 1, 7, pal.weapon); // bow
      put(g, 11, 4, 1, 1, pal.weapon);
      put(g, 11, 10, 1, 1, pal.weapon);
      break;
    case 'mage':
      put(g, 4, 0, 8, 2, pal.body); // hat brim
      put(g, 6, -1, 4, 1, pal.body);
      put(g, 11, 4, 1, 8, 0x6b4a2b); // staff
      put(g, 10, 3, 3, 2, pal.weapon);
      break;
    case 'cleric':
      put(g, 5, 1, 6, 2, pal.trim); // hood
      put(g, 11, 4, 1, 8, 0x8b6a3b); // staff
      put(g, 10, 3, 3, 2, pal.weapon);
      put(g, 7, 7, 2, 3, 0xd8453a); // cross on the chest
      put(g, 6, 8, 4, 1, 0xd8453a);
      break;
    case 'assassin':
      put(g, 5, 1, 6, 3, pal.body); // hood
      put(g, 6, 3, 4, 1, skin);
      put(g, 11, 6, 1, 4, pal.weapon); // dagger
      put(g, 4, 8, 1, 3, pal.weapon);
      break;
  }
}

/** Creates every unit texture once. Call from the first scene's create(). */
export function buildTextures(scene: Phaser.Scene): void {
  for (const id of Object.keys(CLASSES) as ClassId[]) {
    for (const team of [0, 1] as const) {
      const key = unitTexture(id, team);
      if (scene.textures.exists(key)) continue;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      drawUnit(g, id, team);
      g.generateTexture(key, SIZE, SIZE);
      g.destroy();
    }
  }
  if (!scene.textures.exists('spark')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    g.generateTexture('spark', 4, 4);
    g.destroy();
  }
}
