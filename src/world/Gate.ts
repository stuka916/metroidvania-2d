import Phaser from 'phaser';

const TEXTURE_KEY = 'gate';
const TILE = 32;
const OPEN_DURATION_MS = 700;

// Barrera de barrotes que bloquea el paso hasta que se abre (con una palanca u otro evento).
// TileSprite: repite la textura de 32x32 para cubrir el tamaño del rectángulo de Tiled
export class Gate extends Phaser.GameObjects.TileSprite {
  declare body: Phaser.Physics.Arcade.StaticBody;

  // x, y: centro de la barrera
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    Gate.createPlaceholderTexture(scene);
    super(scene, x, y, width, height, TEXTURE_KEY);
    scene.add.existing(this);
    // true = cuerpo estático: no le afecta la gravedad ni lo empujan los demás
    scene.physics.add.existing(this, true);
  }

  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x263238);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x90a4ae);
    for (let x = 3; x < TILE; x += 9) g.fillRect(x, 0, 4, TILE); // barrotes
    g.fillStyle(0x607d8b);
    g.fillRect(0, TILE / 2 - 2, TILE, 4); // travesaño
    g.generateTexture(TEXTURE_KEY, TILE, TILE);
    g.destroy();
  }

  // animate = false: abrirla al instante (al volver a una zona donde ya se abrió)
  open(animate = true): void {
    this.body.enable = false;

    if (!animate) {
      this.setVisible(false);
      return;
    }

    // Se desliza hacia arriba (detrás del muro) mientras se desvanece
    this.scene.tweens.add({
      targets: this,
      y: this.y - this.height,
      alpha: 0,
      duration: OPEN_DURATION_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.setVisible(false),
    });
  }
}
