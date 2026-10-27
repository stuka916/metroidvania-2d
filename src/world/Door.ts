import Phaser from 'phaser';
import type { MapKey } from '../config/assets';

const TEXTURE_KEY = 'door';
const WIDTH = 40;
const HEIGHT = 64;

// Puerta que lleva a otra zona: al pulsar W delante de ella se carga targetMap
// y el jugador aparece en el spawn targetSpawn de ese mapa
export class Door extends Phaser.GameObjects.Image {
  readonly targetMap: MapKey;
  readonly targetSpawn: string;

  private prompt: Phaser.GameObjects.Text;

  // x, y: centro de la puerta
  constructor(scene: Phaser.Scene, x: number, y: number, targetMap: MapKey, targetSpawn: string) {
    Door.createPlaceholderTexture(scene);
    super(scene, x, y, TEXTURE_KEY);
    scene.add.existing(this);

    this.targetMap = targetMap;
    this.targetSpawn = targetSpawn;

    // Indicador "W" que flota sobre la puerta cuando el jugador está delante
    this.prompt = scene.add
      .text(x, y - HEIGHT / 2 - 14, 'W', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#1d1d2b',
        backgroundColor: '#ffeb3b',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    scene.tweens.add({ targets: this.prompt, y: this.prompt.y - 4, duration: 400, yoyo: true, repeat: -1 });
  }

  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3e2723);
    g.fillRect(0, 0, WIDTH, HEIGHT); // marco
    g.fillStyle(0x6d4c41);
    g.fillRect(4, 4, WIDTH - 8, HEIGHT - 4); // hoja
    g.fillStyle(0x4e342e);
    for (let y = 14; y < HEIGHT; y += 14) g.fillRect(4, y, WIDTH - 8, 2);
    g.fillStyle(0xffca28);
    g.fillCircle(WIDTH - 11, HEIGHT / 2 + 4, 3); // pomo
    g.generateTexture(TEXTURE_KEY, WIDTH, HEIGHT);
    g.destroy();
  }

  setPromptVisible(visible: boolean): void {
    this.prompt.setVisible(visible);
  }

  destroy(fromScene?: boolean): void {
    this.prompt.destroy();
    super.destroy(fromScene);
  }
}
