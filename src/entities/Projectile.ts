import Phaser from 'phaser';

const TEXTURE_KEY = 'projectile';
const SIZE = 10;
const LIFETIME_MS = 2500;
const POOL_SIZE = 30;

export class Projectile extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;

  readonly damage = 1;

  private expiresAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Projectile.createPlaceholderTexture(scene);
    super(scene, x, y, TEXTURE_KEY);
  }

  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xff7043);
    g.fillCircle(SIZE / 2, SIZE / 2, SIZE / 2);
    g.fillStyle(0xffe0b2);
    g.fillCircle(SIZE / 2, SIZE / 2, SIZE / 4);
    g.generateTexture(TEXTURE_KEY, SIZE, SIZE);
    g.destroy();
  }

  fire(x: number, y: number, velocityX: number, velocityY: number, time: number): void {
    // enableBody(reset, x, y, activar, mostrar): reutiliza un proyectil que estaba "apagado" en el pool
    this.enableBody(true, x, y, true, true);
    this.body.setAllowGravity(false);
    this.setVelocity(velocityX, velocityY);
    this.expiresAt = time + LIFETIME_MS;
  }

  // Lo llama el grupo cada frame (runChildUpdate) mientras está activo
  update(time: number): void {
    if (time >= this.expiresAt) this.deactivate();
  }

  // En vez de destruirlo, se apaga y vuelve al pool para reutilizarlo en el siguiente disparo
  deactivate(): void {
    this.disableBody(true, true);
  }
}

// Pool de proyectiles: crear y destruir objetos en cada disparo es caro, así que se reciclan
export class ProjectilePool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Projectile,
      maxSize: POOL_SIZE,
      allowGravity: false,
      runChildUpdate: true,
    });
    // Registrar el grupo en la escena para que se ejecute su preUpdate (y con él runChildUpdate)
    scene.add.existing(this);
  }

  fire(x: number, y: number, velocityX: number, velocityY: number): void {
    // get() devuelve un proyectil inactivo o crea uno nuevo; null si el pool está lleno
    const projectile = this.get(x, y) as Projectile | null;
    projectile?.fire(x, y, velocityX, velocityY, this.scene.time.now);
  }
}
