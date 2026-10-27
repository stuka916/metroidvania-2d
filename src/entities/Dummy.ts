import Phaser from 'phaser';
import { Enemy } from './Enemy';

const TEXTURE_KEY = 'dummy';
const WIDTH = 28;
const HEIGHT = 36;

const DEFAULT_MAX_HEALTH = 5;
const PATROL_SPEED = 60;

export interface DummyOptions {
  maxHealth?: number;
  // Distancia (px) que patrulla a cada lado de su punto de aparición; 0 = se queda quieto
  patrolRange?: number;
}

export class Dummy extends Enemy {
  private readonly patrolRange: number;
  private direction: -1 | 1 = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, options: DummyOptions = {}) {
    Dummy.createPlaceholderTexture(scene);
    super(scene, x, y, TEXTURE_KEY, { maxHealth: options.maxHealth ?? DEFAULT_MAX_HEALTH });
    this.patrolRange = options.patrolRange ?? 0;
  }

  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xab47bc);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x000000);
    g.fillRect(6, 10, 4, 4);
    g.fillRect(WIDTH - 10, 10, 4, 4);
    g.generateTexture(TEXTURE_KEY, WIDTH, HEIGHT);
    g.destroy();
  }

  protected updateBehavior(): void {
    if (this.patrolRange <= 0) {
      this.setVelocityX(0);
      return;
    }

    // Da la vuelta al llegar al límite de la patrulla o al chocar con una pared
    if (this.x <= this.spawnX - this.patrolRange || this.body.blocked.left) this.direction = 1;
    else if (this.x >= this.spawnX + this.patrolRange || this.body.blocked.right) this.direction = -1;

    this.setVelocityX(this.direction * PATROL_SPEED);
    this.setFlipX(this.direction === -1);
  }

  protected onRespawn(): void {
    this.direction = 1;
  }
}
