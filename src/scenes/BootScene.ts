import Phaser from 'phaser';
import { APP_VERSION } from '../version';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** M0 placeholder: proves the pipeline (build, deploy, landscape scaling) end to end. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Arena floor placeholder.
    const g = this.add.graphics();
    g.fillStyle(0x2a2118, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(4, 0x8a6a3b, 1).strokeEllipse(cx, cy + 20, 760, 380);
    g.lineStyle(2, 0x4a3a22, 1).strokeEllipse(cx, cy + 20, 700, 330);

    this.add
      .text(cx, cy - 30, 'COMBAT MODE: ARENA', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f1d9a0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 25, `v${APP_VERSION}  -  M0 pipeline check`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#b89a63',
      })
      .setOrigin(0.5);
  }
}
