import Phaser from 'phaser';

const TEXTURE_OFF = 'lever-off';
const TEXTURE_ON = 'lever-on';
const WIDTH = 16;
const HEIGHT = 24;

// Palanca que se activa golpeándola con el ataque. "target" es el nombre (en Tiled) de lo que abre
export class Lever extends Phaser.GameObjects.Image {
  readonly target: string;
  private activated: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, target: string, activated: boolean) {
    Lever.createPlaceholderTextures(scene);
    super(scene, x, y, activated ? TEXTURE_ON : TEXTURE_OFF);
    scene.add.existing(this);

    this.target = target;
    this.activated = activated;
  }

  private static createPlaceholderTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_OFF)) return;

    for (const [key, on] of [[TEXTURE_OFF, false], [TEXTURE_ON, true]] as const) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      // Mango inclinado a la izquierda (apagada) o a la derecha (encendida)
      g.lineStyle(3, 0xbdbdbd);
      g.lineBetween(WIDTH / 2, HEIGHT - 6, on ? WIDTH - 3 : 3, 4);
      g.fillStyle(on ? 0x66bb6a : 0xef5350);
      g.fillCircle(on ? WIDTH - 3 : 3, 4, 3);
      // Base
      g.fillStyle(0x546e7a);
      g.fillRect(0, HEIGHT - 6, WIDTH, 6);
      g.generateTexture(key, WIDTH, HEIGHT);
      g.destroy();
    }
  }

  get isActivated(): boolean {
    return this.activated;
  }

  // Devuelve true solo la primera vez (una palanca activada no se puede desactivar)
  activate(): boolean {
    if (this.activated) return false;
    this.activated = true;
    this.setTexture(TEXTURE_ON);
    return true;
  }
}
