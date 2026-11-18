import type Phaser from 'phaser';
import { ARENA } from '../sim/constants';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/** Deterministic pseudo-noise so the arena looks the same on every run. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Draws the static arena (sand floor, stone wall, crowd, torches) once. */
export function drawArena(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-1000);

  // Outer stone.
  g.fillStyle(0x1c1814, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Crowd stands, top and bottom, as rows of coloured heads.
  const crowdColors = [0xb85c38, 0x5c7fb8, 0xc9b458, 0x6aa36a, 0x9a6ab8, 0xd8d0c0];
  const rows: Array<[number, number]> = [
    [4, 52],
    [ARENA.maxY + 8, GAME_HEIGHT - 4],
  ];
  for (const [y0, y1] of rows) {
    g.fillStyle(0x2a231c, 1).fillRect(0, y0, GAME_WIDTH, y1 - y0);
    for (let y = y0 + 6; y < y1 - 4; y += 9) {
      for (let x = 6; x < GAME_WIDTH - 6; x += 10) {
        const h = hash(x, y);
        const c = crowdColors[Math.floor(h * crowdColors.length)] ?? 0xffffff;
        g.fillStyle(0x1a1510, 1).fillRect(x, y + 3, 7, 5);
        g.fillStyle(c, 1).fillRect(x + 1, y, 5, 4);
      }
    }
  }

  // Sand floor with grain.
  const fx = ARENA.minX - 30;
  const fy = ARENA.minY - 8;
  const fw = ARENA.maxX - ARENA.minX + 60;
  const fh = ARENA.maxY - ARENA.minY + 16;
  g.fillStyle(0xb89a62, 1).fillRect(fx, fy, fw, fh);
  for (let y = fy; y < fy + fh; y += 8) {
    for (let x = fx; x < fx + fw; x += 8) {
      const h = hash(x, y);
      if (h < 0.28) g.fillStyle(0xa78a55, 1).fillRect(x, y, 8, 8);
      else if (h > 0.9) g.fillStyle(0xc6aa72, 1).fillRect(x, y, 8, 8);
    }
  }

  // Painted ring + centre line.
  const cx = GAME_WIDTH / 2;
  const cy = (ARENA.minY + ARENA.maxY) / 2;
  g.lineStyle(4, 0x8c6c3a, 0.55).strokeEllipse(cx, cy, 700, 330);
  g.lineStyle(3, 0x8c6c3a, 0.4).lineBetween(cx, fy + 6, cx, fy + fh - 6);
  g.lineStyle(3, 0x8c6c3a, 0.4).strokeCircle(cx, cy, 46);

  // Stone wall edge.
  g.lineStyle(8, 0x3a3128, 1).strokeRect(fx, fy, fw, fh);
  g.lineStyle(2, 0x5a4c3a, 1).strokeRect(fx + 4, fy + 4, fw - 8, fh - 8);

  // Torches on the four corners.
  const torch = (x: number, y: number): void => {
    g.fillStyle(0x4a3322, 1).fillRect(x - 3, y, 6, 14);
    g.fillStyle(0xff9a2a, 1).fillRect(x - 5, y - 8, 10, 9);
    g.fillStyle(0xffd86a, 1).fillRect(x - 3, y - 5, 6, 5);
  };
  torch(fx + 6, fy - 4);
  torch(fx + fw - 6, fy - 4);
  torch(fx + 6, fy + fh - 12);
  torch(fx + fw - 6, fy + fh - 12);
}
