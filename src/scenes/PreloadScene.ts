import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { TILEMAP, TILESET, SFX_FILES } from '../config/assets';

const BAR_WIDTH = 300;
const BAR_HEIGHT = 12;

// Carga todos los recursos una sola vez; al reiniciar MainScene ya están en caché
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    this.createProgressBar();

    this.load.tilemapTiledJSON(TILEMAP.key, TILEMAP.url);
    this.load.image(TILESET.key, TILESET.url);

    for (const [key, url] of Object.entries(SFX_FILES)) {
      this.load.audio(key, url);
    }
  }

  create(): void {
    this.scene.start('MainScene');
  }

  private createProgressBar(): void {
    const x = GAME_WIDTH / 2 - BAR_WIDTH / 2;
    const y = GAME_HEIGHT / 2;

    this.add.rectangle(x, y, BAR_WIDTH, BAR_HEIGHT, 0x2b2b3d).setOrigin(0, 0.5);
    const fill = this.add.rectangle(x, y, 0, BAR_HEIGHT, 0x4fc3f7).setOrigin(0, 0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      fill.width = BAR_WIDTH * progress;
    });
  }
}
