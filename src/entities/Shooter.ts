import Phaser from 'phaser';
import { Enemy } from './Enemy';

const TEXTURE_KEY = 'shooter';
const WIDTH = 28;
const HEIGHT = 32;

const DEFAULT_MAX_HEALTH = 3;
// Distancia a la que detecta al jugador
const DETECTION_RANGE = 380;
// Aviso visual (se tiñe de naranja) antes de disparar, para que el jugador pueda reaccionar
const WINDUP_MS = 350;
const CHARGE_TINT = 0xffb74d;
const SHOT_COOLDOWN_MS = 1400;
const PROJECTILE_SPEED = 240;
// El proyectil sale desde el borde del enemigo, no desde su centro
const MUZZLE_OFFSET = 16;

// El Shooter no crea los proyectiles: avisa con un evento y la escena decide cómo dispararlos
export const ShooterEvents = {
  FIRE: 'shooter-fire', // (x: number, y: number, velocityX: number, velocityY: number)
} as const;

export interface ShooterOptions {
  // Lo que vigila: basta con algo que tenga posición (normalmente el Player)
  target: { x: number; y: number };
  maxHealth?: number;
}

// Torreta estática: detecta al jugador dentro de su rango y le dispara apuntando a su posición
export class Shooter extends Enemy {
  private readonly target: { x: number; y: number };
  private nextShotTime = 0;
  // Momento en que termina la carga del disparo actual; 0 = no está cargando
  private chargeEndsAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ShooterOptions) {
    Shooter.createPlaceholderTexture(scene);
    super(scene, x, y, TEXTURE_KEY, { maxHealth: options.maxHealth ?? DEFAULT_MAX_HEALTH });
    this.target = options.target;
  }

  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x26a69a);
    g.fillRect(0, 4, WIDTH, HEIGHT - 4);
    g.fillStyle(0x00796b);
    g.fillRect(4, 0, WIDTH - 8, 6);
    g.fillStyle(0xffeb3b);
    g.fillRect(WIDTH - 10, 12, 8, 6); // "ojo" / cañón
    g.generateTexture(TEXTURE_KEY, WIDTH, HEIGHT);
    g.destroy();
  }

  protected updateBehavior(time: number): void {
    this.setVelocityX(0);

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;

    if (Math.hypot(dx, dy) > DETECTION_RANGE) {
      this.cancelCharge();
      return;
    }

    this.setFlipX(dx < 0);

    if (this.chargeEndsAt === 0) {
      if (time >= this.nextShotTime) {
        this.chargeEndsAt = time + WINDUP_MS;
        this.setTint(CHARGE_TINT);
      }
      return;
    }

    if (time < this.chargeEndsAt) return;

    this.cancelCharge();
    this.nextShotTime = time + SHOT_COOLDOWN_MS;

    // Apunta a donde está el jugador AHORA (no predice su movimiento): se puede esquivar moviéndose
    const angle = Math.atan2(dy, dx);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    this.emit(
      ShooterEvents.FIRE,
      this.x + dirX * MUZZLE_OFFSET,
      this.y + dirY * MUZZLE_OFFSET,
      dirX * PROJECTILE_SPEED,
      dirY * PROJECTILE_SPEED,
    );
  }

  // Golpearle mientras carga interrumpe el disparo
  protected onHurt(): void {
    this.chargeEndsAt = 0;
  }

  protected onRespawn(): void {
    this.chargeEndsAt = 0;
    this.nextShotTime = 0;
  }

  private cancelCharge(): void {
    if (this.chargeEndsAt === 0) return;
    this.chargeEndsAt = 0;
    this.clearTint();
  }
}
