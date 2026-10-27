import Phaser from 'phaser';

// Al recibir un golpe: retroceso y parpadeo blanco durante HURT_MS (el comportamiento se pausa)
const KNOCKBACK_SPEED = 160;
const HURT_MS = 150;
const RESPAWN_DELAY_MS = 2000;

const HEALTH_BAR_WIDTH = 32;
const HEALTH_BAR_HEIGHT = 4;

export interface EnemyConfig {
  maxHealth: number;
  contactDamage?: number;
  // Color de los trozos que suelta al ser destruido
  particleColor: number;
}

// Base común de los enemigos: vida, daño recibido, barra de vida, muerte y reaparición.
// Cada subclase solo define su comportamiento en updateBehavior()
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  // Daño que recibe el jugador al tocarlo
  readonly contactDamage: number;
  readonly particleColor: number;

  protected readonly maxHealth: number;
  protected readonly spawnX: number;
  protected readonly spawnY: number;
  protected health: number;

  private hurtUntil = 0;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, config: EnemyConfig) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    this.maxHealth = config.maxHealth;
    this.health = config.maxHealth;
    this.contactDamage = config.contactDamage ?? 1;
    this.particleColor = config.particleColor;
    this.spawnX = x;
    this.spawnY = y;

    this.healthBarBg = scene.add.rectangle(0, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, 0x000000, 0.6);
    // Origen a la izquierda: al escalar en X la barra se vacía de derecha a izquierda
    this.healthBarFill = scene.add
      .rectangle(0, 0, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, 0xe53935)
      .setOrigin(0, 0.5);
  }

  get isAlive(): boolean {
    return this.health > 0;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (this.hurtUntil !== 0) {
      if (time < this.hurtUntil) {
        this.updateHealthBar();
        return;
      }
      this.hurtUntil = 0;
      this.clearTint();
    }

    this.updateBehavior(time);
    this.updateHealthBar();
  }

  takeDamage(amount: number, fromX: number): void {
    if (!this.isAlive) return;

    this.health = Math.max(0, this.health - amount);
    this.showDamageNumber(amount);

    if (!this.isAlive) {
      this.die();
      return;
    }

    this.onHurt();

    // Retroceso alejándose de quien golpea
    const pushDirection = this.x >= fromX ? 1 : -1;
    this.setVelocityX(pushDirection * KNOCKBACK_SPEED);
    this.setTintFill(0xffffff);
    this.hurtUntil = this.scene.time.now + HURT_MS;
  }

  destroy(fromScene?: boolean): void {
    this.healthBarBg.destroy();
    this.healthBarFill.destroy();
    super.destroy(fromScene);
  }

  // Comportamiento propio de cada enemigo; no se llama mientras está aturdido por un golpe
  protected abstract updateBehavior(time: number): void;

  // Ganchos opcionales para las subclases
  protected onHurt(): void {}
  protected onRespawn(): void {}

  private updateHealthBar(): void {
    const y = this.y - this.displayHeight / 2 - 8;
    this.healthBarBg.setPosition(this.x, y);
    this.healthBarFill.setPosition(this.x - HEALTH_BAR_WIDTH / 2, y);
    this.healthBarFill.setScale(this.health / this.maxHealth, 1);
  }

  private showDamageNumber(amount: number): void {
    const text = this.scene.add
      .text(this.x, this.y - this.displayHeight / 2, `-${amount}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffeb3b',
      })
      .setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 24,
      alpha: 0,
      duration: 500,
      onComplete: () => text.destroy(),
    });
  }

  private die(): void {
    // Sin cuerpo activo ya no colisiona ni puede recibir más golpes
    this.body.enable = false;
    this.setVelocity(0, 0);
    this.healthBarBg.setVisible(false);
    this.healthBarFill.setVisible(false);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 250,
      onComplete: () => {
        // disableBody(desactivar, ocultar): deja de llamarse preUpdate hasta reaparecer
        this.disableBody(true, true);
        this.scene.time.delayedCall(RESPAWN_DELAY_MS, () => this.respawn());
      },
    });
  }

  // Enemigos de prueba: reaparecen para poder seguir practicando
  private respawn(): void {
    this.health = this.maxHealth;
    this.hurtUntil = 0;
    this.setAlpha(1);
    this.clearTint();
    this.enableBody(true, this.spawnX, this.spawnY, true, true);
    this.healthBarBg.setVisible(true);
    this.healthBarFill.setVisible(true);
    this.onRespawn();
  }
}
