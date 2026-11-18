import Phaser from 'phaser';
import { buildTextures } from '../render/textures';

/** Builds the placeholder textures once, then hands over to the battle. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    buildTextures(this);
    this.scene.start('BattleScene');
  }
}
