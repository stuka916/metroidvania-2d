import Phaser from 'phaser';

const PIP_SIZE = 16;
const PIP_GAP = 6;
const LABEL_GAP = 10;
const FULL_COLOR = 0xe53935;
const EMPTY_COLOR = 0x2b2b3d;
const BORDER_COLOR = 0xffffff;

// Vida del jugador en pantalla: una casilla por punto de vida + contador "3/5"
export class HealthHud extends Phaser.GameObjects.Container {
  private pips: Phaser.GameObjects.Rectangle[] = [];
  private counter: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, maxHealth: number) {
    super(scene, x, y);
    scene.add.existing(this);

    const textStyle = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };
    const label = scene.add.text(0, 0, 'VIDA', textStyle);
    this.add(label);

    let pipX = label.width + LABEL_GAP;
    for (let i = 0; i < maxHealth; i++) {
      const pip = scene.add
        .rectangle(pipX, 1, PIP_SIZE, PIP_SIZE, FULL_COLOR)
        .setOrigin(0, 0)
        .setStrokeStyle(1, BORDER_COLOR, 0.6);
      this.pips.push(pip);
      pipX += PIP_SIZE + PIP_GAP;
    }
    this.add(this.pips);

    this.counter = scene.add.text(pipX + LABEL_GAP - PIP_GAP, 0, '', textStyle);
    this.add(this.counter);

    // El contenedor entero queda fijo en pantalla (sus hijos heredan el scrollFactor) y por encima del nivel
    this.setScrollFactor(0).setDepth(100);
    this.setHealth(maxHealth);
  }

  setHealth(health: number): void {
    this.pips.forEach((pip, i) => pip.setFillStyle(i < health ? FULL_COLOR : EMPTY_COLOR));
    this.counter.setText(`${health}/${this.pips.length}`);
  }
}
